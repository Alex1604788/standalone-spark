console.log("[Автоответ] Контент-скрипт запущен на:", window.location.href);

// 🔒 ЗАЩИТА: Если скрипт уже запущен на этой странице, прерываем выполнение
if (window.__AUTOOTVET_CONTENT_RUNNING) {
  console.warn("[Автоответ] ⚠️ content.js уже запущен на этой странице, прерываем дубликат");
  throw new Error("Content script already running");
}
window.__AUTOOTVET_CONTENT_RUNNING = true;

(async () => {
  //
  // === КОНСТАНТЫ ===
  //

  const OZON_REVIEWS_API_URL = "https://seller.ozon.ru/api/v4/review/list";
  const OZON_QUESTIONS_API_URL = "https://seller.ozon.ru/api/v1/question-list";

  // Окна выборки в зависимости от режима
  const FULL_WINDOW = 3000;
  const LIVE_WINDOW = 500;

  //
  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
  //

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function parseDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  function isNewItem(createdAt, lastDate) {
    if (!createdAt) return false;
    const itemDate = parseDate(createdAt);
    if (!itemDate) return false;
    if (!lastDate) return true; // первичная синхронизация — берём всё
    return itemDate > lastDate;
  }

  //
  // === МАППИНГ ОТЗЫВОВ ===
  //

  function mapOzonItemToReview(item) {
    const product = item.product || {};
    const url = product.url || "";

    // ✅ ИСПРАВЛЕНО: СНАЧАЛА извлекаем product_id из URL (это главный идентификатор)
    let productExternalId = "";
    if (url) {
      const m = url.match(/product\/(\d+)/);
      if (m) {
        productExternalId = m[1]; // Это product_id - главный ID товара в Ozon
      }
    }

    // Если product_id не найден - пробуем offer_id как запасной вариант
    if (!productExternalId && product.offer_id) {
      console.warn("[Автоответ] ⚠️ product_id не найден в URL, используем offer_id:", product.offer_id);
      productExternalId = product.offer_id;
    }

    // Если и offer_id нет - используем SKU (крайний случай)
    if (!productExternalId && product.sku) {
      console.warn("[Автоответ] ⚠️ product_id и offer_id не найдены, используем SKU:", product.sku);
      productExternalId = String(product.sku);
    }

    const article = product.offer_id || "";
    const productName = product.title || "";
    const productImage = product.cover_image || "";

    const text = item.text || "";
    const rating = item.rating || 0;
    const createdAt = item.published_at || "";

    const hasPhotos = (item.photos_count || 0) > 0;

    // Определяем статус на основе interaction_status
    const interactionStatus = item.interaction_status || "NEW";
    let status = "new";
    let isAnswered = false;

    switch (interactionStatus) {
      case "PROCESSED":
        status = "answered";
        isAnswered = true;
        break;
      case "IN_PROGRESS":
        status = "moderation";
        isAnswered = false;
        break;
      case "BLOCKED":
        status = "archived";
        isAnswered = false;
        break;
      default: // NEW
        status = "new";
        isAnswered = false;
    }

    return {
      external_id: item.uuid,
      product_external_id: productExternalId, // ✅ Теперь это product_id из URL
      product_offer_id: product.offer_id || "", // ✅ Артикул продавца для поиска
      product_name: productName,
      article,
      order_number: "", // в этом API номера заказа нет
      author_name: "", // имя клиента тут тоже не приходит
      text,
      advantages: "",
      disadvantages: "",
      rating,
      review_date: createdAt,
      created_at: createdAt,
      photos: [], // сами ссылки на фото тут не отдают
      has_photos: hasPhotos,
      product_image: productImage,
      status,
      is_answered: isAnswered,
    };
  }

  function buildOzonReviewsPayload(companyId, lastReviewCursor) {
    const payload = {
      company_id: String(companyId),
      company_type: "seller",
      filter: {
        published_at: {},
        interaction_status: ["ALL"],
      },
    };

    if (lastReviewCursor) {
      // Ozon ожидает объект вида { timestamp, uuid, rating }
      payload.last_review = lastReviewCursor;
    }

    return payload;
  }

  async function fetchReviewsPage(apiUrl, companyId, lastReviewCursor) {
    const payload = buildOzonReviewsPayload(companyId, lastReviewCursor);

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error("Ozon review list API error: " + resp.status);
    }

    const json = await resp.json();
    return json; // { result: [...], last_review: {...}, hasNext: true/false }
  }

  //
  // === МАППИНГ ВОПРОСОВ ===
  //

  function mapOzonItemToQuestion(item) {
    const product = item.product || {};
    const author = item.author || {};

    // ✅ ИСПРАВЛЕНО: СНАЧАЛА извлекаем product_id из URL
    let productExternalId = "";
    if (product.url) {
      const m = product.url.match(/product\/(\d+)/);
      if (m) {
        productExternalId = m[1]; // Это product_id
      }
    }

    // Если product_id не найден - пробуем offer_id как запасной вариант
    if (!productExternalId && product.offer_id) {
      console.warn("[Автоответ] ⚠️ product_id не найден в URL, используем offer_id:", product.offer_id);
      productExternalId = product.offer_id;
    }

    // Если и offer_id нет - используем SKU (крайний случай)
    if (!productExternalId && product.sku) {
      console.warn("[Автоответ] ⚠️ product_id и offer_id не найдены, используем SKU:", product.sku);
      productExternalId = String(product.sku);
    }

    const productName = product.title || "";
    const productImage = product.photo_link || "";
    const authorName = author.name || "";
    const text = item.text || "";
    const createdAt = item.published_at || "";
    const ozonStatus = item.status || "NEW";
    const answersCount = item.answers_total_count || 0;

    // Определяем статус и is_answered
    let status = "new";
    let isAnswered = false;

    if (answersCount > 0 || ozonStatus === "PROCESSED") {
      status = "answered";
      isAnswered = true;
    } else if (ozonStatus === "IN_PROGRESS") {
      status = "moderation";
      isAnswered = false;
    } else if (ozonStatus === "ARCHIVED" || ozonStatus === "DELETED") {
      status = "archived";
      isAnswered = false;
    } else {
      status = "new";
      isAnswered = false;
    }

    return {
      external_id: String(item.id),
      product_external_id: productExternalId, // ✅ Теперь это product_id из URL
      product_offer_id: product.offer_id || "", // ✅ Артикул продавца для поиска
      product_name: productName,
      product_image: productImage,
      author_name: authorName,
      text,
      created_at: createdAt,
      question_date: createdAt,
      status,
      is_answered: isAnswered,
    };
  }

  async function fetchQuestionsPage(apiUrl, sellerId, paginationLastId) {
    const payload = {
      sc_company_id: String(sellerId),
      company_type: "seller",
      filter: { status: "ALL" },
      pagination_last_id: paginationLastId || "0",
      with_brands: false,
      with_counters: false,
    };

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      throw new Error("Ozon question-list API error: " + resp.status);
    }

    const json = await resp.json();
    return json;
  }

  //
  // === СБОР ОТЗЫВОВ С ЗАЩИТОЙ ОТ ЗАЦИКЛИВАНИЯ ===
  //

  async function collectReviews(options) {
    const { sellerId, mode, lastReviewDate } = options;

    const maxReviews = mode === "full" ? FULL_WINDOW : LIVE_WINDOW;
    const isLiveMode = mode !== "full";

    const reviews = [];

    let lastReviewCursor = null;
    let lastCursorKey = null;
    let reviewPageIndex = 0;

    console.log("[Автоответ] Сбор отзывов: режим =", mode, "max =", maxReviews);

    const MAX_PAGES = 10000;

    while (reviews.length < maxReviews && reviewPageIndex < MAX_PAGES) {
      reviewPageIndex += 1;
      console.log(`[Автоответ] Отзывы – страница ${reviewPageIndex}, собрано ${reviews.length}`);

      let page;
      try {
        page = await fetchReviewsPage(OZON_REVIEWS_API_URL, sellerId, lastReviewCursor);
      } catch (e) {
        console.error("[Автоответ] Ошибка запроса отзывов:", e);
        break;
      }

      const items = Array.isArray(page.result) ? page.result : [];
      console.log(`[Автоответ] Отзывы: получено ${items.length} элементов, hasNext=${page.hasNext}`);

      // 1) Пустой список — считаем, что дошли до конца
      if (!items.length) {
        console.log("[Автоответ] Отзывы: пустой список — останавливаемся");
        break;
      }

      // 2) Курсор из ответа
      const currentCursorKey = page.last_review ? JSON.stringify(page.last_review) : null;

      // Если курсора нет — дальше идти некуда
      if (!currentCursorKey) {
        console.log("[Автоответ] Отзывы: курсор не вернулся — останавливаемся");
        break;
      }

      // 3) Курсор не изменился по сравнению с прошлым запросом → зацикливание, стоп
      if (currentCursorKey === lastCursorKey) {
        console.log("[Автоответ] Отзывы: курсор не изменился — достигнут конец списка");
        break;
      }

      // 4) Обрабатываем элементы
      let pageNewCount = 0;

      for (const item of items) {
        const mapped = mapOzonItemToReview(item);

        // 🔍 ОТЛАДОЧНЫЙ ЛОГ
        if (reviews.length === 0) {
          console.log("[Автоответ] 🔍 DEBUG первый отзыв:", {
            url: item.product?.url,
            extracted_product_id: mapped.product_external_id,
            offer_id: item.product?.offer_id,
            sku: item.product?.sku,
          });
        }

        // В live-режиме фильтруем по дате, в full берём всё
        if (isLiveMode) {
          const isNewByDate = isNewItem(mapped.created_at, lastReviewDate);
          if (!isNewByDate) continue;
        }

        reviews.push(mapped);
        pageNewCount += 1;

        if (reviews.length >= maxReviews) break;
      }

      // В live-режиме: если страница не дала ни одного нового — прекращаем
      if (isLiveMode && pageNewCount === 0) {
        console.log("[Автоответ] Отзывы (live): на странице нет новых элементов — прерываем");
        break;
      }

      // Обновляем курсор, чтобы запросить следующую страницу
      lastReviewCursor = page.last_review;
      lastCursorKey = currentCursorKey;

      // hasNext учитываем только как подсказку: если он false — точно закончено
      if (page.hasNext === false) {
        console.log("[Автоответ] Отзывы: hasNext=false — останавливаемся");
        break;
      }

      await sleep(400);
    }

    console.log("[Автоответ] Собрано отзывов:", reviews.length);
    return reviews;
  }

  //
  // === СБОР ВОПРОСОВ С ЗАЩИТОЙ ОТ ЗАЦИКЛИВАНИЯ ===
  //

  async function collectQuestions(options) {
    const { sellerId, mode, lastQuestionDate } = options;

    const maxQuestions = mode === "full" ? FULL_WINDOW : LIVE_WINDOW;
    const isLiveMode = mode !== "full";

    const questions = [];

    let paginationLastId = "0";
    let lastPaginationKey = null;
    let questionPageIndex = 0;

    console.log("[Автоответ] Сбор вопросов: режим =", mode, "max =", maxQuestions);

    const MAX_PAGES = 10000;

    // ✅ ДОБАВЬ ЭТИ СТРОКИ:
    console.log("[Автоответ] 🔍 DEBUG сбор вопросов:", {
      mode: mode,
      maxQuestions: maxQuestions,
      FULL_WINDOW: FULL_WINDOW,
      LIVE_WINDOW: LIVE_WINDOW,
      isLiveMode: isLiveMode,
    });
    while (questions.length < maxQuestions && questionPageIndex < MAX_PAGES) {
      questionPageIndex += 1;
      console.log(
        `[Автоответ] Вопросы – страница ${questionPageIndex}, собрано ${questions.length}, pagination_last_id=${paginationLastId}`,
      );

      let page;
      try {
        page = await fetchQuestionsPage(OZON_QUESTIONS_API_URL, sellerId, paginationLastId);
      } catch (e) {
        console.error("[Автоответ] Ошибка запроса вопросов:", e);
        break;
      }

      const items = Array.isArray(page.result) ? page.result : [];
      console.log(
        `[Автоответ] Вопросы: получено ${items.length} элементов, pagination_last_id=${page.pagination_last_id}`,
      );

      // 1) Пустой список — считаем, что дошли до конца
      if (!items.length) {
        console.log("[Автоответ] Вопросы: пустой список — останавливаемся");
        break;
      }

      // 2) Текущий курсор пагинации
      const currentPaginationId =
        typeof page.pagination_last_id === "string"
          ? page.pagination_last_id
          : page.pagination_last_id != null
            ? String(page.pagination_last_id)
            : null;

      if (!currentPaginationId) {
        console.log("[Автоответ] Вопросы: pagination_last_id отсутствует — останавливаемся");
        break;
      }

      // 3) Курсор не изменился — значит зацикливание / конец списка
      if (currentPaginationId === lastPaginationKey) {
        console.log("[Автоответ] Вопросы: pagination_last_id не изменился — достигнут конец списка");
        break;
      }

      let pageNewCount = 0;

      for (const item of items) {
        const mapped = mapOzonItemToQuestion(item);

        // В live-режиме фильтруем по дате, в full берём всё
        if (isLiveMode) {
          const isNewByDate = isNewItem(mapped.created_at, lastQuestionDate);
          if (!isNewByDate) continue;
        }

        questions.push(mapped);
        pageNewCount += 1;

        if (questions.length >= maxQuestions) break;
      }

      // В live-режиме: если страница не дала ни одного нового — прекращаем
      if (isLiveMode && pageNewCount === 0) {
        console.log("[Автоответ] Вопросы (live): на странице нет новых элементов — прерываем");
        break;
      }

      // Обновляем курсор
      lastPaginationKey = currentPaginationId;
      paginationLastId = currentPaginationId;

      // По документации Ozon: "0" обычно означает конец списка
      if (currentPaginationId === "0") {
        console.log("[Автоответ] Вопросы: pagination_last_id == '0' — конец списка");
        break;
      }

      await sleep(400);
    }

    console.log("[Автоответ] Собрано вопросов:", questions.length);
    return questions;
  }

  //
  // === ГЛАВНАЯ ФУНКЦИЯ СБОРА ОТЗЫВОВ И ВОПРОСОВ ===
  //

  async function collectReviewsAndQuestions() {
    // Читаем режим из storage
    const storage = await chrome.storage.local.get(["scanMode", "lastReviewDate", "lastQuestionDate", "sellerId"]);

    const mode = storage.scanMode === "full" ? "full" : "live";
    const lastReviewDate = storage.lastReviewDate ? new Date(storage.lastReviewDate) : null;
    const lastQuestionDate = storage.lastQuestionDate ? new Date(storage.lastQuestionDate) : null;
    const sellerId = storage.sellerId;

    console.log("[Автоответ] Режим синхронизации:", mode, {
      lastReviewDate: lastReviewDate ? lastReviewDate.toISOString() : null,
      lastQuestionDate: lastQuestionDate ? lastQuestionDate.toISOString() : null,
      sellerId,
    });

    // ⛔ КРИТИЧЕСКАЯ ПРОВЕРКА: sellerId обязателен
    if (!sellerId) {
      const errorMsg = "⚠️ ОШИБКА: Seller ID не задан в настройках расширения. Откройте popup расширения и заполните поле 'Seller ID' (Client-Id из Ozon).";
      console.error("[Автоответ]", errorMsg);
      
      // Отправляем сообщение в background для показа уведомления
      chrome.runtime.sendMessage({
        type: "SCAN_RESULT",
        payload: {
          reviews: [],
          questions: [],
          error: errorMsg,
        },
      });
      
      return { reviews: [], questions: [] };
    }

    // Сбор отзывов
    const reviews = await collectReviews({
      sellerId,
      mode,
      lastReviewDate,
    });

    if (reviews.length > 0) {
      const newestReviewDate = reviews.reduce((latest, review) => {
        const d = parseDate(review.created_at);
        return !d || (latest && d <= latest) ? latest : d;
      }, null);

      if (newestReviewDate) {
        await chrome.storage.local.set({ lastReviewDate: newestReviewDate.toISOString() });
        console.log("[Автоответ] Сохранена дата последнего отзыва:", newestReviewDate.toISOString());
      }
    }

    // Сбор вопросов
    const questions = await collectQuestions({
      sellerId,
      mode,
      lastQuestionDate,
    });

    if (questions.length > 0) {
      const newestQuestionDate = questions.reduce((latest, question) => {
        const d = parseDate(question.created_at);
        return !d || (latest && d <= latest) ? latest : d;
      }, null);

      if (newestQuestionDate) {
        await chrome.storage.local.set({ lastQuestionDate: newestQuestionDate.toISOString() });
        console.log("[Автоответ] Сохранена дата последнего вопроса:", newestQuestionDate.toISOString());
      }
    }

    return { reviews, questions };
  }

  //
  // === ЗАПУСК ===
  //

  try {
    const { reviews, questions } = await collectReviewsAndQuestions();

    console.log("[Автоответ] Найдено новых элементов:", {
      reviews: reviews.length,
      questions: questions.length,
    });

    chrome.runtime.sendMessage({
      type: "SCAN_RESULT",
      payload: {
        reviews,
        questions,
      },
    });
  } catch (err) {
    console.error("[Автоответ] Ошибка контент-скрипта:", err);
    chrome.runtime.sendMessage({
      type: "SCAN_RESULT",
      payload: {
        reviews: [],
        questions: [],
        error: "CONTENT_JS_ERROR",
        detail: String(err),
      },
    });
  }
})();
