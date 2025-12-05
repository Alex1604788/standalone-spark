// background.js - PROMISE-BASED MUTEX (v2.0.8-FIXED)
console.log("Автоответ background v2.0.8-FIXED started");

const MIN_DELAY_MS = 12000;
const MAX_DELAY_MS = 25000;
const BATCH_LIMIT = 5;

const OZON_REVIEWS_URL = "https://seller.ozon.ru/app/reviews";
const OZON_QUESTIONS_URL = "https://seller.ozon.ru/app/reviews/questions";
const BACKEND_URL = "https://nxymhkyvhcfcwjcfcbfy.supabase.co/functions/v1";
const SYNC_REVIEWS_URL = BACKEND_URL + "/sync-reviews";

const pendingPublishResolvers = new Map();
const publishedReplies = new Set();
const processedScans = new Map();

// 🔒 PROMISE-BASED MUTEX
class Mutex {
  constructor() {
    this.queue = [];
    this.locked = new Set();
  }

  async lock(key) {
    // Если ключ уже заблокирован - ждём в очереди
    while (this.locked.has(key)) {
      await new Promise((resolve) => {
        this.queue.push({ key, resolve });
      });
    }
    // Блокируем ключ
    this.locked.add(key);
    console.log(`[BG] 🔒 [MUTEX-LOCKED] ${key}`);
  }

  unlock(key) {
    this.locked.delete(key);
    console.log(`[BG] 🔓 [MUTEX-UNLOCKED] ${key}`);

    // Разблокируем следующий в очереди для этого ключа
    const nextIndex = this.queue.findIndex((item) => item.key === key);
    if (nextIndex !== -1) {
      const next = this.queue.splice(nextIndex, 1)[0];
      next.resolve();
    }
  }

  isLocked(key) {
    return this.locked.has(key);
  }
}

const publishResultMutex = new Mutex();

let isPublishing = false;
let publishScriptInjected = false;

const defaultState = {
  autoScan: false,
  scanIntervalMin: 10,
  verifiedEmail: "",
  sellerId: "",
  marketplaceId: null,
  lastScanAt: null,
  lastScanCount: 0,
  lastError: "",
  sessionStatus: "inactive",
  failCount: 0,
};

async function getState() {
  const st = await chrome.storage.local.get(Object.keys(defaultState));
  return { ...defaultState, ...st };
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
  chrome.runtime.sendMessage({ type: "STATE_UPDATED" }).catch(() => {});
}

const ALARM_LIVE_REVIEWS = "live_reviews";
const ALARM_LIVE_QUESTIONS = "live_questions";
const ALARM_FULL_SYNC = "full_sync";
const ALARM_PUBLISH = "publish_queue";

function scheduleAlarms() {
  chrome.alarms.create(ALARM_LIVE_REVIEWS, { periodInMinutes: 30 });
  chrome.alarms.create(ALARM_LIVE_QUESTIONS, { periodInMinutes: 10 });
  chrome.alarms.create(ALARM_FULL_SYNC, { periodInMinutes: 1440 });
  chrome.alarms.create(ALARM_PUBLISH, { periodInMinutes: 1 });
  console.log("[BG] Таймеры запущены");
}

chrome.runtime.onInstalled.addListener(async () => {
  await setState(defaultState);
  scheduleAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const state = await getState();
  if (state.sessionStatus === "paused" || state.sessionStatus === "error") return;

  if (alarm.name === ALARM_PUBLISH) {
    await checkPendingReplies();
  } else if (state.autoScan && state.sessionStatus === "active") {
    if (alarm.name === ALARM_LIVE_REVIEWS) {
      console.log("[BG] Аларм: Сканируем отзывы");
      await runScan("live");
    } else if (alarm.name === ALARM_LIVE_QUESTIONS) {
      console.log("[BG] Аларм: Сканируем вопросы");
      await runScan("live");
    } else if (alarm.name === ALARM_FULL_SYNC) {
      await runScan("full");
    }
  }
});

async function runScan(mode = "live") {
  const state = await getState();
  if (!state.marketplaceId) return;

  try {
    await chrome.storage.local.set({ scanMode: mode });
    const tabId = await ensureTab();
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    console.log(`[BG] content.js запущен (${mode})`);
  } catch (error) {
    console.error("[BG] Ошибка запуска скана:", error);
  }
}

async function handleScanResult(payload) {
  console.log("[BG] Результат сканирования:", payload);

  const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  const scanKey = `${reviews
    .map((r) => r.external_id)
    .sort()
    .join(",")}_${questions
    .map((q) => q.external_id)
    .sort()
    .join(",")}`;

  const now = Date.now();
  if (processedScans.has(scanKey)) {
    const lastProcessed = processedScans.get(scanKey);
    if (now - lastProcessed < 30000) {
      console.warn(`[BG] ⚠️ Дубликат SCAN_RESULT, пропускаем`);
      return;
    }
  }
  processedScans.set(scanKey, now);

  for (const [key, timestamp] of processedScans.entries()) {
    if (now - timestamp > 120000) {
      processedScans.delete(key);
    }
  }

  if (payload.error && (payload.error === "AUTH_REQUIRED" || payload.error === "CAPTCHA_DETECTED")) {
    await triggerKillSwitch();
    return;
  }

  const totalFound = reviews.length + questions.length;
  const state = await getState();

  await setState({
    lastScanAt: new Date().toISOString(),
    lastScanCount: totalFound,
    lastError: "",
    failCount: 0,
  });

  if (totalFound === 0) return;

  try {
    const resp = await fetch(SYNC_REVIEWS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace_id: state.marketplaceId,
        reviews,
        questions,
        extension_version: "2.0.8",
      }),
    });
    if (!resp.ok) throw new Error(`Sync failed: ${resp.status}`);
    console.log(`[BG] Отправлено на сервер: ${totalFound}`);
  } catch (err) {
    console.error("[BG] Ошибка отправки:", err);
  }
}

function getRandomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1) + MIN_DELAY_MS);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkPendingReplies() {
  if (isPublishing) {
    console.log("[BG] Публикация уже идёт, пропускаем...");
    return;
  }

  const state = await getState();
  if (!state.marketplaceId || state.sessionStatus !== "active") return;

  isPublishing = true;

  try {
    const resp = await fetch(BACKEND_URL + "/get-pending-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace_id: state.marketplaceId }),
    });

    if (!resp.ok) {
      console.error("[BG] Ошибка get-pending-replies:", resp.status);
      return;
    }

    const data = await resp.json();
    const allReplies = data.replies || [];

    if (allReplies.length === 0) {
      console.log("[BG] Нет ответов к публикации");
      return;
    }

    const batch = allReplies.slice(0, BATCH_LIMIT);
    console.log(`[BG] 📦 Взято в работу ${batch.length} из ${allReplies.length}`);

    const tabId = await ensureTab();
    await chrome.tabs.reload(tabId);
    await sleep(5000);

    for (const r of batch) {
      const currState = await getState();
      if (currState.sessionStatus !== "active") break;

      if (publishedReplies.has(r.id)) {
        console.warn(`[BG] ⚠️ Reply ${r.id} уже был опубликован, пропускаем`);
        continue;
      }

      try {
        await publishReply(r);
        publishedReplies.add(r.id);

        const delay = getRandomDelay();
        console.log(`[BG] ☕ Пауза ${delay / 1000} сек...`);
        await sleep(delay);
      } catch (e) {
        console.error("[BG] Ошибка публикации:", e);
        const errStr = String(e);
        if (errStr.includes("AUTH_REQUIRED") || errStr.includes("CAPTCHA")) {
          console.warn("[BG] 🛑 АВТОРИЗАЦИЯ СЛЕТЕЛА");
          await triggerKillSwitch();
          break;
        }
      }
    }
  } catch (err) {
    console.error("[BG] Ошибка checkPendingReplies:", err);
  } finally {
    isPublishing = false;
  }
}

async function ensureTab() {
  let tabs = await chrome.tabs.query({ url: "https://seller.ozon.ru/*" });
  let tab = tabs.find((t) => t.url && t.url.startsWith("https://seller.ozon.ru"));
  if (!tab) {
    tab = await chrome.tabs.create({ url: OZON_REVIEWS_URL, active: false });
  }
  try {
    await chrome.tabs.update(tab.id, { autoDiscardable: false });
  } catch (e) {}
  return tab.id;
}

async function publishReply(reply, retryCount = 0) {
  const MAX_RETRIES = 3;

  if (retryCount >= MAX_RETRIES) {
    throw new Error(`PUBLISH_FAILED: Exceeded max retries (${MAX_RETRIES})`);
  }

  const tabId = await ensureTab();

  // Проверяем состояние вкладки перед инъекцией
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.includes("chrome-error://")) {
      console.warn("[BG] Вкладка показывает страницу ошибки, перезагружаем...");
      await chrome.tabs.reload(tabId);
      await sleep(5000);
    }
  } catch (e) {
    console.error("[BG] Ошибка проверки вкладки:", e);
    throw new Error("TAB_CHECK_FAILED");
  }

  // Инъекция скрипта
  if (!publishScriptInjected) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content_publish.js"],
      });
      publishScriptInjected = true;
      console.log("[BG] content_publish.js загружен");
      await sleep(2000);
    } catch (e) {
      console.error("[BG] Ошибка загрузки content_publish.js:", e);
      publishScriptInjected = false;

      // Если ошибка связана с фреймом, перезагружаем вкладку
      if (e.message && e.message.includes("frame")) {
        console.warn("[BG] Проблема с фреймом, перезагружаем вкладку...");
        await chrome.tabs.reload(tabId);
        await sleep(5000);
        return publishReply(reply, retryCount + 1);
      }
      throw e;
    }
  }

  // Проверка готовности скрипта
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING_PUBLISH" });
  } catch (e) {
    console.warn(`[BG] content_publish.js не отвечает (попытка ${retryCount + 1}/${MAX_RETRIES})`);
    publishScriptInjected = false;

    // Перезагружаем вкладку перед повторной попыткой
    await chrome.tabs.reload(tabId);
    await sleep(5000);

    return publishReply(reply, retryCount + 1);
  }

  // Публикация ответа
  return new Promise((resolve, reject) => {
    const replyId = reply.id;
    pendingPublishResolvers.set(replyId, { resolve, reject });

    chrome.tabs
      .sendMessage(tabId, {
        type: "PUBLISH_REPLY",
        payload: reply,
      })
      .catch((err) => {
        pendingPublishResolvers.delete(replyId);
        reject(err);
      });

    setTimeout(() => {
      if (pendingPublishResolvers.has(replyId)) {
        pendingPublishResolvers.delete(replyId);
        reject(new Error("TIMEOUT"));
      }
    }, 40000);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCAN_RESULT") {
    handleScanResult(msg.payload);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "PUBLISH_RESULT") {
    handlePublishResult(msg.payload);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "SCAN_NOW") {
    runScan("live");
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "FULL_SYNC_NOW") {
    runScan("full");
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

async function handlePublishResult(payload) {
  const replyId = payload.reply_id;

  console.log(`[BG] 📬 [MUTEX-ENTRY] Попытка обработки reply_id=${replyId}`);

  // 🔒 ЖДЁМ ПОЛУЧЕНИЯ БЛОКИРОВКИ (мьютекс)
  await publishResultMutex.lock(replyId);

  try {
    // Проверяем: уже обрабатывали?
    const processedKey = replyId + "_completed";
    if (publishedReplies.has(processedKey)) {
      console.warn(`[BG] ⚠️ [MUTEX-SKIP] reply_id=${replyId} уже был обработан ранее`);
      return;
    }

    console.log(`[BG] ✅ [STEP 1] Начало обработки reply_id=${replyId}, success=${payload.success}`);

    // 1️⃣ Резолвим промис
    if (pendingPublishResolvers.has(replyId)) {
      const resolver = pendingPublishResolvers.get(replyId);
      if (payload.success) resolver.resolve(payload);
      else resolver.reject(payload.message || payload.error);
      pendingPublishResolvers.delete(replyId);
      console.log(`[BG] ✅ [STEP 2] Промис зарезолвлен`);
    }

    // 2️⃣ Вызываем mark-reply-published ОДИН РАЗ
    console.log(`[BG] 🔄 [STEP 3] Вызов mark-reply-published для reply_id=${replyId}`);

    let markSuccess = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    while (!markSuccess && retryCount < MAX_RETRIES) {
      try {
        const markResp = await fetch(BACKEND_URL + "/mark-reply-published", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reply_id: replyId,
            success: payload.success,
            error_message: payload.message || payload.error,
          }),
        });

        if (!markResp.ok) {
          const errText = await markResp.text();
          throw new Error(`mark-reply-published failed: ${markResp.status} ${errText}`);
        }

        const result = await markResp.json();
        if (!result.success) {
          throw new Error(`mark-reply-published returned success=false`);
        }

        console.log(`[BG] ✅ [STEP 4] mark-reply-published УСПЕШНО`);
        markSuccess = true;
      } catch (err) {
        retryCount++;
        console.error(`[BG] ❌ [STEP 4.ERROR] Попытка ${retryCount}/${MAX_RETRIES}:`, err);

        if (retryCount < MAX_RETRIES) {
          await sleep(2000);
        } else {
          console.error(`[BG] 🔴 [STEP 4.FATAL] НЕ УДАЛОСЬ обновить статус`);
        }
      }
    }

    // Помечаем как завершённый
    publishedReplies.add(processedKey);
    console.log(`[BG] ✅ [STEP 5 COMPLETE] Обработка завершена`);

    // 3️⃣ Проверяем на критичные ошибки
    if (!payload.success) {
      const err = String(payload.error || "");
      if (err.includes("AUTH_REQUIRED") || err.includes("CAPTCHA")) {
        await triggerKillSwitch();
      }
    }
  } finally {
    // 🔓 СНИМАЕМ БЛОКИРОВКУ (мьютекс)
    publishResultMutex.unlock(replyId);
  }
}

async function triggerKillSwitch() {
  console.warn("[BG] 💀 KILL-SWITCH");
  await setState({
    sessionStatus: "paused",
    lastError: "Требуется вход в Ozon",
  });
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title: "Автоответ: Требуется вход",
    message: "Ozon запросил проверку. Пожалуйста, зайдите в кабинет.",
  });
}
