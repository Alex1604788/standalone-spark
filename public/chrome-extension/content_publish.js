// content_publish.js — v6.0: Fixed double-publish and invalid type issues
console.log("[Автоответ Publish] v6.0 loaded — Added type validation");

(() => {
  try {
    let cachedSellerId = null;

    async function getSellerId() {
      if (cachedSellerId) return cachedSellerId;
      const state = await chrome.storage.local.get(["sellerId"]);
      cachedSellerId = state.sellerId || null;
      return cachedSellerId;
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "PING_PUBLISH") {
        sendResponse({ ok: true });
        return false;
      }

      if (message.type !== "PUBLISH_REPLY") return false;

      (async () => {
        const payload = message.payload || {};
        const rawContent = payload.text || payload.content || "";
        const reply_id = payload.id;
        const external_id = payload.external_id;
        const type = payload.type; // ← Получаем type
        const content = rawContent.trim();

        console.log("[Автоответ] 📦 Processing reply_id:", reply_id);

        if (!content) {
          console.error("[Автоответ] ❌ Content is empty!");
          const errorPayload = {
            reply_id,
            success: false,
            error: "EMPTY_CONTENT",
            message: "Текст ответа пуст",
          };
          chrome.runtime.sendMessage({
            type: "PUBLISH_RESULT",
            payload: errorPayload,
          });
          return;
        }

        // 🔒 Проверяем type
        if (!type || (type !== "review" && type !== "question")) {
          console.error(`[Автоответ] ❌ Invalid type: ${type}. Must be 'review' or 'question'.`);
          const errorPayload = {
            reply_id,
            success: false,
            error: "INVALID_TYPE",
            message: `Неверный тип ответа: ${type}`,
          };
          chrome.runtime.sendMessage({
            type: "PUBLISH_RESULT",
            payload: errorPayload,
          });
          return;
        }

        try {
          const sellerIdRaw = await getSellerId();
          if (!sellerIdRaw) throw new Error("Seller ID not found");
          const sellerIdStr = String(sellerIdRaw);

          if (document.querySelector('[class*="captcha"], [id*="captcha"]')) {
            throw new Error("CAPTCHA_DETECTED");
          }

          let attempts = [];

          if (type === "review") {
            attempts.push({
              name: "Review (Field: text)",
              url: "https://seller.ozon.ru/api/review/comment/create",
              body: {
                company_id: sellerIdStr,
                company_type: "seller",
                review_uuid: external_id,
                text: content,
              },
            });
          } else if (type === "question") {
            attempts.push({
              name: "Question (String IDs)",
              url: "https://seller.ozon.ru/api/v1/create-answer",
              body: {
                sc_company_id: sellerIdStr,
                company_type: "seller",
                question_id: String(external_id),
                text: content,
              },
            });
          }

          // 🔒 Защита: если attempts пустой
          if (attempts.length === 0) {
            console.error(`[Автоответ] ❌ No attempts configured for type: ${type}`);
            const errorPayload = {
              reply_id,
              success: false,
              error: "NO_ATTEMPTS",
              message: `Не настроены попытки для типа: ${type}`,
            };
            chrome.runtime.sendMessage({
              type: "PUBLISH_RESULT",
              payload: errorPayload,
            });
            return;
          }

          let lastError = null;
          let publishSuccess = false;

          for (const attempt of attempts) {
            console.log(`[Автоответ] 🔄 Trying: ${attempt.name}`);

            try {
              const response = await fetch(attempt.url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  "X-Requested-With": "XMLHttpRequest",
                },
                body: JSON.stringify(attempt.body),
                credentials: "include",
              });

              const textRes = await response.text();
              let jsonRes = {};
              try {
                jsonRes = JSON.parse(textRes);
              } catch (e) {
                jsonRes = { raw: textRes };
              }

              if (response.ok) {
                publishSuccess = true;
                console.log(`[Автоответ] ✅ SUCCESS via ${attempt.name}`);
                break;
              } else {
                if (response.status === 400) {
                  console.warn(`[Автоответ] ⚠️ 400 Bad Request. Trying next...`);
                  lastError = jsonRes.message || "400 Bad Request";
                  await sleep(500);
                  continue;
                }
                if (response.status === 401 || response.status === 403) {
                  throw new Error("AUTH_REQUIRED");
                }
                throw new Error(`API Error ${response.status}: ${jsonRes.message || textRes}`);
              }
            } catch (err) {
              lastError = err.message;
              if (lastError.includes("AUTH") || lastError.includes("CAPTCHA")) {
                throw err;
              }
            }
          }

          if (publishSuccess) {
            const successPayload = { reply_id, success: true };
            chrome.runtime.sendMessage({
              type: "PUBLISH_RESULT",
              payload: successPayload,
            });
            console.log(`[Автоответ] 📤 Sent success for ${reply_id}`);
          } else {
            throw new Error(lastError || "All attempts failed");
          }
        } catch (err) {
          const msg = String(err.message || err);
          console.error("[Автоответ] ❌ FATAL:", msg);

          let errCode = "PUBLISH_FAILED";
          if (msg.includes("AUTH")) errCode = "AUTH_REQUIRED";
          else if (msg.includes("CAPTCHA")) errCode = "CAPTCHA_DETECTED";
          else if (msg.includes("400") || msg.includes("blank")) errCode = "BAD_REQUEST";

          const errorPayload = { reply_id, success: false, error: errCode, message: msg };
          chrome.runtime.sendMessage({
            type: "PUBLISH_RESULT",
            payload: errorPayload,
          });
          console.log(`[Автоответ] 📤 Sent error for ${reply_id}`);
        }
      })();

      return true;
    });
  } catch (e) {
    console.error("[Автоответ Publish] Init failed:", e);
  }
})();
