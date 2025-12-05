console.log('Popup loaded');

const MARKETPLACE_DASHBOARD_URL = 'https://app.auto-otvet.ru/app/marketplaces';
const STORAGE_KEY = 'rr_settings_v1';

const els = {
  autoScan: document.getElementById('autoScan'),
  scanNow: document.getElementById('scanNow'),
  fullSync: document.getElementById('fullSync'),
  email: document.getElementById('email'),
  mode: document.getElementById('mode'),
  lastScan: document.getElementById('lastScan'),
  count: document.getElementById('count'),
  statusBox: document.getElementById('statusBox'),
  hint: document.getElementById('hint'),
  connectionForm: document.getElementById('connectionForm'),
  accountInfo: document.getElementById('accountInfo'),
  emailInput: document.getElementById('emailInput'),
  sellerIdInput: document.getElementById('sellerIdInput'),
  marketplaceIdInput: document.getElementById('marketplaceIdInput'),
  userIdInput: document.getElementById('userIdInput'),
  saveConnection: document.getElementById('saveConnection'),
  disconnect: document.getElementById('disconnect'),
  switchStore: document.getElementById('switchStore'),
};

// Legacy state for backward compatibility
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
}

// New settings storage
async function getSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
}

async function setSettings(settings) {
  try {
    settings.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    console.log('Settings saved');
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

async function clearSettings() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    // Also clear legacy state
    await chrome.storage.local.clear();
    console.log('All settings cleared');
  } catch (error) {
    console.error('Error clearing settings:', error);
    throw error;
  }
}

async function clearMarketplaceId() {
  try {
    const settings = await getSettings();
    if (settings) {
      settings.marketplaceId = '';
      await setSettings(settings);
    }
    // Also clear from legacy state
    await setState({ marketplaceId: null });
    console.log('Marketplace ID cleared');
  } catch (error) {
    console.error('Error clearing marketplace ID:', error);
    throw error;
  }
}

// --- UI REFRESH ---
async function refresh() {
  const st = await getState();
  const settings = await getSettings();

  // Use new settings if available, fallback to legacy
  const email = settings?.email || st.verifiedEmail || "";
  const sellerId = settings?.sellerId || st.sellerId || "";
  const userId = settings?.userId || "";
  const marketplaceId = settings?.marketplaceId || st.marketplaceId || "";

  // fill status fields
  els.email.textContent = email || "—";
  els.autoScan.checked = !!st.autoScan;
  els.mode.textContent = st.autoScan ? "Авто" : "Выкл";
  els.lastScan.textContent = st.lastScanAt
    ? new Date(st.lastScanAt).toLocaleString('ru-RU')
    : "—";
  els.count.textContent = String(st.lastScanCount || 0);

  // is fully connected?
  const isConnected = Boolean(
    email &&
    sellerId &&
    marketplaceId &&
    st.sessionStatus === 'active'
  );

  // block visibility
  if (isConnected) {
    els.connectionForm.classList.add('hidden');
    els.accountInfo.classList.remove('hidden');
  } else {
    els.connectionForm.classList.remove('hidden');
    els.accountInfo.classList.add('hidden');

    // prefill inputs from settings
    els.emailInput.value = email;
    els.sellerIdInput.value = sellerId;
    els.marketplaceIdInput.value = marketplaceId;
    if (els.userIdInput) els.userIdInput.value = userId;
  }

  // controls availability
  els.autoScan.disabled = !isConnected;
  els.scanNow.disabled = !isConnected;
  if (els.fullSync) els.fullSync.disabled = !isConnected;

  // status banner
  let statusText = "";
  let statusClass = "";

  if (isConnected) {
    statusText = '✅ Подключено к магазину';
    statusClass = 'active';
  } else {
    statusText = 'Введите Email Ozon, Seller ID и ID магазина из Автоответ';
    statusClass = 'needs-login';
  }

  els.statusBox.textContent = statusText;
  els.statusBox.className = `status ${statusClass}`;

  // hint
  if (isConnected) {
    els.hint.textContent = "✅ Автоответ сканирует отзывы и вопросы в фоне и готовит черновики ответов.";
    els.hint.style.color = "";
  } else {
    els.hint.textContent = "💡 После подключения Автоответ будет каждые 10 мин. скачивать новые отзывы и формировать ответы.";
    els.hint.style.color = "";
  }

  console.log('UI refreshed', st);
}

// --- Save connection ---
els.saveConnection.addEventListener('click', async () => {
  const email = els.emailInput.value.trim();
  const sellerId = els.sellerIdInput.value.trim();
  const marketplaceId = els.marketplaceIdInput.value.trim();
  const autoScan = els.autoScan.checked;

  if (!email || !sellerId || !marketplaceId) {
    els.statusBox.textContent = '⚠️ Заполните все поля';
    els.statusBox.className = 'status needs-login';
    return;
  }

  // simple UUID check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(marketplaceId)) {
    els.statusBox.textContent = '⚠️ Неверный ID магазина';
    els.statusBox.className = 'status error';
    return;
  }

  // Save connection locally
  await setState({
    verifiedEmail: email,
    sellerId: sellerId,
    marketplaceId: marketplaceId,
    autoScan: autoScan,
    sessionStatus: 'active',
    lastError: '',
  });

  els.statusBox.textContent = '✅ Подключено к магазину';
  els.statusBox.className = 'status active';

  chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARM" });

  setTimeout(() => refresh(), 300);
});

// --- Auto-scan toggle ---
els.autoScan.addEventListener('change', async (e) => {
  const checked = e.target.checked;
  await setState({ autoScan: checked });

  chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARM" }, () => {
    console.log('Alarm rescheduled');
  });

  refresh();
});

// --- Manual scan (live) ---
els.scanNow.addEventListener('click', async () => {
  const st = await getState();

  if (!st.verifiedEmail || !st.sellerId || !st.marketplaceId || st.sessionStatus !== 'active') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Автоответ',
      message: 'Сначала подключите магазин в расширении'
    });
    return;
  }

  els.scanNow.disabled = true;
  els.scanNow.textContent = 'Сканирование...';

  chrome.runtime.sendMessage({ type: "SCAN_NOW" }, () => {
    setTimeout(() => {
      els.scanNow.disabled = false;
      els.scanNow.textContent = 'Сканировать сейчас';
      refresh();
    }, 2000);
  });
});

// --- Full sync ---
if (els.fullSync) {
  els.fullSync.addEventListener('click', async () => {
    const st = await getState();

    if (!st.verifiedEmail || !st.sellerId || !st.marketplaceId || st.sessionStatus !== 'active') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'Автоответ',
        message: 'Сначала подключите магазин в расширении'
      });
      return;
    }

    els.fullSync.disabled = true;
    els.fullSync.textContent = 'Идёт полная синхронизация...';

    chrome.runtime.sendMessage({ type: "FULL_SYNC_NOW" }, () => {
      setTimeout(() => {
        els.fullSync.disabled = false;
        els.fullSync.textContent = 'Полная синхронизация';
        refresh();
      }, 3000);
    });
  });
}

// --- Disconnect / сменить магазин ---
if (els.disconnect) {
  els.disconnect.addEventListener('click', async () => {
    await setState({
      verifiedEmail: "",
      sellerId: "",
      marketplaceId: null,
      sessionStatus: "inactive",
      lastError: "",
      autoScan: false,
    });
    refresh();
  });
}

// listen for bg state changes
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "STATE_UPDATED") {
    refresh();
  }
});

// initial render
refresh();
