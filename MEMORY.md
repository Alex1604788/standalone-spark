# MEMORY — Standalone Spark (Автоответ OZON)

## Суперсилы Claude Code
```bash
# Установка (один раз):
cd ~/.claude && git clone https://github.com/nicekid1/Claude-Code-Superpowers.git superpowers && cat superpowers/install.sh | bash

# Обновление:
cd ~/.claude/superpowers && git pull
```

---

## Доступы и ключи

### Supabase
- **Project Ref:** `bkmicyguzlwampuindff`
- **Dashboard:** https://supabase.com/dashboard/project/bkmicyguzlwampuindff
- **REST API URL:** `https://bkmicyguzlwampuindff.supabase.co`
- **Supabase PAT (Management API):** `sbp_207f19ba7d297bd025bee1ca0ef4169775f803df`
- **Service Role Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ`

### OZON Seller API
- **Client-Id:** `1172055`
- **API Key:** `6a584aee-c327-46a0-b46d-9aa7cdd92361`
- **API Base:** `https://api-seller.ozon.ru`

### GitHub
- **Repo:** https://github.com/Alex1604788/standalone-spark
- **GitHub PAT:** `ghp_**** (см. локальный файл, не хранить в git)`

### Идентификаторы в БД
- **Marketplace ID:** `84b1d0f5-6750-407c-9b04-28c051972162`
- **User ID:** `34458753-5070-4f35-86a2-3e8ccbec6e38` (aaf@aravt.ru)

---

## Вспомогательные скрипты (в корне проекта)

| Файл | Назначение |
|---|---|
| `run_query.ps1` | Выполняет SQL через Supabase Management API. Тело запроса берёт из `tmp_query.json` |
| `tmp_query.json` | JSON-файл с запросом: `{"query": "SELECT ..."}` |
| `cleanup_v3.ps1` | Soft-delete дублей черновиков (batches по 5000) |
| `trigger_full_sync.ps1` | Ручной запуск sync-reviews-api |
| `trigger_product_sync.ps1` | Ручной запуск sync-products |
| `check_ozon_reviews.ps1` | Прямой тест OZON API `/v1/review/list` |
| `trigger_questions_sync.ps1` | Ручной запуск sync-questions-api |
| `multi_sync_questions.ps1` | 5 синков вопросов подряд с паузами |
| `deploy_questions.ps1` | Деплой sync-questions-api на Supabase |
| `check_question_sku.ps1` | Прямой тест OZON API `/v1/question/list` (5 вопросов) |

### Как выполнить SQL-запрос к БД:
```bash
# 1. Записать запрос в tmp_query.json
echo '{"query":"SELECT segment, COUNT(*) FROM reviews WHERE deleted_at IS NULL GROUP BY segment"}' > tmp_query.json

# 2. Выполнить через PowerShell
powershell -File run_query.ps1

# ИЛИ напрямую через curl (REST API, не SQL):
curl -s "https://bkmicyguzlwampuindff.supabase.co/rest/v1/reviews?select=id&segment=eq.unanswered&limit=1" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Prefer: count=exact" -D - | grep Content-Range
```

---

## Архитектура проекта

- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Edge Functions на Deno)
- **Деплой:** Через Lovable (автоматически при пуше в main)
- **Cron Jobs:** pg_cron + pg_net вызывают Edge Functions каждые 10 мин

### Ключевые Edge Functions:
| Функция | Назначение | Cron |
|---|---|---|
| `sync-reviews-api` | Синхронизация отзывов через OZON API (курсорная пагинация) | каждые 10 мин |
| `sync-products` | Синхронизация товаров OZON | каждые 10 мин |
| `sync-chats-api` | Синхронизация чатов OZON (30 дней) | каждые 10 мин |
| `auto-generate-drafts` | Автогенерация черновиков ответов | cron |
| `process-scheduled-replies` | Публикация запланированных ответов в OZON | каждую минуту |

### Ключевые файлы фронтенда:
| Файл | Назначение |
|---|---|
| `src/pages/Reviews.tsx` | Страница отзывов (главная рабочая страница) |
| `src/pages/Chats.tsx` | Страница чатов (фильтр отвечено/не отвечено) |
| `src/pages/ReviewQueue.tsx` | Очередь черновиков |
| `src/components/AppLayout.tsx` | Сайдбар с счётчиками (строки 107-175) |
| `src/lib/reviewHelpers.ts` | Хелперы: getReplyStatus, getReplyText, getProductName |
| `src/pages/analytics/AnalyticsReviews.tsx` | Аналитика отзывов |

---

## OZON API — Важные особенности

### `/v1/review/list` — Получение отзывов
- Ответ: `{ reviews: [...], last_id: "...", has_next: true }` (НЕ `result.reviews`!)
- **Пагинация ТОЛЬКО через `last_id`** — `offset`, `since`, `sort_dir` ИГНОРИРУЮТСЯ
- Отзывы всегда возвращаются **от старых к новым**
- `limit`: от 20 до 100
- `comments_amount` включает ВСЕ комментарии (покупатель + модерация + продавец), а НЕ только ответы продавца
- **КРИТИЧНО:** `mark_review_as_processed: true` в review/comment/create НЕ РАБОТАЕТ — отзывы НИКОГДА не переходят в статус PROCESSED на стороне OZON. Фильтр `status: UNPROCESSED` = ВСЕ отзывы (все 18,000+ за 30 дней), т.к. ни один не помечается PROCESSED

### Товары
- `offer_id` — уникальный артикул продавца (1 товар = 1 offer_id)
- `product_id` (external_id в БД) — внутренний артикул OZON (уникален)
- `SKU` — НЕ уникален! Уценённый товар может иметь 2 SKU на 1 offer_id

---

## Что сделано (сессии 1-3, март 2026)

### 1. Синхронизация чатов (sync-chats-api)
- **Исправлено:** NULL credentials, направление истории (Backward), батчинг, camelCase fallback
- **Ограничено:** 30 дней вместо всех
- **Добавлено:** Фильтр отвечено/не отвечено на странице Чатов

### 2. Синхронизация отзывов (sync-reviews-api) — ПЕРЕПИСАНА (v6)
- **Исправлен парсинг OZON API:** `reviewsData.reviews` вместо `reviewsData.result?.reviews`
- **Курсорная пагинация:** Сохраняет `reviews_sync_cursor` в таблице `marketplaces` для возобновления между запусками крона
- **Map-based поиск товаров** вместо Array.find (быстрее в 1000x)
- **Batch upserts** по 50 записей
- **Убрано `is_answered`** из upsert данных (определяется триггером по опубликованным ответам)
- **MAX_PAGES = 50** за один запуск крона
- **Фильтр по дате:** Отзывы старше 2 месяцев пропускаются (не сохраняются), но пагинация продолжается

### 3. Формула сегментов — ОБНОВЛЕНА
- **Функция `calculate_review_segment()`** теперь проверяет:
  1. Есть published replies → archived
  2. comments_amount > 0 И старше 2 месяцев → archived
  3. is_answered = true → archived
  4. Есть pending replies (drafted/scheduled) → pending
  5. Иначе → unanswered

### 4. Очистка дублей черновиков
- **Было:** 668,618 drafted replies (массовые дубли)
- **Soft-deleted:** ~485,000 (UPDATE SET deleted_at = NOW())
- **Осталось неудалённых дублей:** ~172,000 (нужно дочистить)
- **Таблица `replies`** до сих пор тяжёлая из-за soft-deleted строк

### 5. Синхронизация товаров
- Запущена sync-products → 1,136 товаров синхронизировано

### 6. Зависшие ответы
- 6 ответов со статусом "failed" сброшены в "scheduled"

### 7. Fix 500 на странице отзывов
- Добавлен `.is("replies.deleted_at", null)` во ВСЕ запросы к replies:
  - `Reviews.tsx` — основной запрос, loadDraft, checkExistingReply
  - `ReviewQueue.tsx` — fetchDrafts
  - `AnalyticsReviews.tsx` — основной запрос

### 8. Схема БД
- **Добавлена колонка:** `ALTER TABLE marketplaces ADD COLUMN reviews_sync_cursor TEXT DEFAULT NULL`

---

## Текущее состояние (на 16.03.2026 — сессия 8)

### Счётчики (на 16.03.2026):
- Отзывов в БД: ~60,434 (все archived)
- Вопросов в БД: 5031 (1111 без product_id — старые, OZON API их не возвращает)
- Товаров: 1,188

### Статус публикации:
- Rating 4,5 → auto-publish (scheduled → published автоматически)
- Rating 1,2,3 → черновики на ручное одобрение (намеренно)

### Важные правила:
- Рейтинг 1,2,3 — ТОЛЬКО ручное одобрение, никогда не auto-publish
- Вопросы — отвечаем вручную
- `calculate_review_segment()` обновлена: убрано условие comments_amount

### OZON "Новый" статус:
- OZON support подтвердил: нет официального API для ответов на отзывы
- Статус "Новый" снимается ТОЛЬКО: а) вручную просмотром, б) кнопкой "Отметить просмотренными"
- `/v1/review/comment/create` с `mark_review_as_processed: true` публикует ответ, но НЕ снимает статус "Новый"
- Плагин работал корректно т.к. симулировал реальные действия пользователя в браузере

---

## Незавершённые задачи

### 1. OZON "Новый" статус отзывов
- Статус не снимается через API, только через ручной просмотр или кнопку "Отметить просмотренными"
- Возможное решение: проверить OZON API на эндпоинт `/v1/review/mark-as-processed` или аналог

### 2. Деплой Reviews.tsx в Lovable (409 conflict fix)
- Commit 24eaa3f + 0259422 в GitHub, но Lovable не задеплоил автоматически
- Нужно зайти в Lovable → sync from GitHub → deploy
- Эти коммиты исправляют 409/23505 ошибки при bulk send

---

## Оригинальные 5 задач от пользователя

| # | Задача | Статус |
|---|---|---|
| 1 | Ограничить синхронизацию чатов 30 днями + фильтр отвечено/не отвечено | ✅ Сделано |
| 2 | Починить счётчики в сайдбаре (Отзывы, Вопросы, Чаты) | ✅ Счётчики работают, данные корректные |
| 3 | Починить автозаполнение отзывов шаблонами | ✅ Починено (deleted_at filter + segment bug fixed) |
| 4 | Починить ошибки "Ожидает публикации", повторить зависшие | ✅ 6 ответов сброшены в scheduled |
| 5 | Расхождение отзывов (OZON 2497 vs приложение 289) | ✅ Segment bug исправлен (0 unanswered теперь), reviews sync продолжается |

## Исправления сессии 12 (18.03.2026 — чаты)

| Исправление | Детали |
|---|---|
| **КРИТИЧЕСКИЙ БАГ: sync cycling** | STEP 2 сортировал по `last_message_at ASC` — одни и те же 30 чатов повторялись каждый запуск (их `last_message_at` не менялся после синка). Исправлено: новая колонка `last_history_synced_at TIMESTAMPTZ DEFAULT NULL`, сортировка `ORDER BY last_history_synced_at NULLS FIRST`, каждый обработанный чат получает метку → уходит в конец очереди. Гарантированный охват ВСЕХ чатов |
| **ALTER TABLE chats** | `ADD COLUMN last_history_synced_at TIMESTAMPTZ DEFAULT NULL` |
| **sync-chats-api v11** | Задеплоен `commit c302e78`. Cycling теперь работает: за 13 синков обработано 441 уникальных чатов (было 0 до фикса) |
| **Статистика после фикса** | 175 BUYER_SELLER чатов с полными данными (last_message_from + checkmarks). 29 чатов: ✓✓ серая (seller last, не прочитано). 146 чатов: 🔴 красный бейдж (buyer last). 7 чатов с unread_count > 0 |
| **Имена покупателей** | OZON API НЕ возвращает имена покупателей (политика конфиденциальности). buyer_name = NULL для всех чатов. Всегда будет "Покупатель" — это платформенное ограничение, не баг |
| **Фото в чатах** | OZON chat images (`api-seller.ozon.ru/v2/chat/file/...`) требуют auth заголовки. Браузер не может добавить их к `<img src>`. Нужен прокси edge function. Пока не реализован |
| **trigger_chats_sync.ps1** | Новый скрипт в корне проекта — ручной запуск N синков чатов подряд |

### Логика галочек в чатах (для справки):
- **В списке (левая панель)**: только когда `last_message_from === 'seller'`: ✓ синяя = прочитано, ✓✓ серая = не прочитано. Когда покупатель последний → 🔴 счётчик вместо галочки
- **В пузырях (правая панель)**: на каждом сообщении продавца: ✓ синяя = `msg.is_read=true`, ✓✓ серая = не прочитано
- **Крон каждые 10 мин** обрабатывает 30 новых чатов. Полный цикл 1476 чатов ≈ 50 запусков ≈ 8 часов

---

## Исправления сессии 11 (17.03.2026 — продолжение)

| Исправление | Детали |
|---|---|
| **КРИТИЧЕСКАЯ НАХОДКА: OZON никогда не меняет статус PROCESSED** | `mark_review_as_processed: true` в `/v1/review/comment/create` ИГНОРИРУЕТСЯ OZON. Все отзывы остаются UNPROCESSED навсегда. OZON UNPROCESSED = все 18,000+ отзывов за 30 дней |
| **sync-reviews-api v14: advancing cursor** | Ключевое изменение: cursor сохраняется после каждого запуска (в reviews_sync_cursor). Run 1: Feb 15→23, Run 2: Feb 23→Mar 3, Run 3: Mar 3→10, Run 4: Mar 10→текущий. Один полный цикл = ~4 запуска (~40 мин). После цикла cursor=null → следующий цикл начинается с 30 дней назад |
| **Проверка возраста cursor** | Если cursor кодирует дату > 31 дня назад → авто-сброс к 30-дневному якорю (предотвращает drift к старым отзывам) |
| **ignoreDuplicates: true** | Только вставка НОВЫХ отзывов (существующие не трогаем — триггер управляет сегментом) |
| **Отдельный ozonHasNext флаг** | `ozonHasNext` (есть ли следующая страница у OZON) отдельно от `continueLoop` (продолжаем ли цикл). Это исправляет баг когда cursor всегда сбрасывался после 50 страниц |
| **Итог БД после исправления** | archived: 171,130 ✅ pending: 222 ✅ **unanswered: 1,012 ✅** (был 0!) |
| **Questions: колонка "Ответ" расширена** | Убраны line-clamp-4 и w-[220px] — теперь текст ответа показывается полностью |
| **Questions: картинки** | onError fallback на icon. SQL исправил 208 вопросов с NULL product_id |
| **sync-questions-api v5** | Добавлен externalIdMap.get(productSku) в цепочку поиска товара |

---

## Исправления сессии 10 (17.03.2026)

| Исправление | Детали |
|---|---|
| **79,000 старых отзывов 2025 заархивированы** | cursor=NULL при отладке → синк затащил 79,000 старых UNPROCESSED отзывов OZON (авг-ноя 2025). Исправлено: cleanup-old-reviews edge function (2-проходной алгоритм обхода BEFORE триггера) — заархивировано 77,000 отзывов за 77 итераций |
| **28,740 scheduled replies отменены** | Опасные auto-scheduled ответы для старых отзывов soft-deleted — они НЕ были отправлены в OZON |
| **sync-reviews-api v12: фильтр 90 дней** | Добавлен `cutoffDate = today - 90 days` — двойная защита: даже если cursor=NULL, старые отзывы никогда не попадут в систему |
| **Cursor исправлен** | `reviews_sync_cursor = 019cf74f-8653-7a04-985b-7efded78b3b6` (2026-03-16) — следующий синк только новее этой даты |
| **GitHub Actions задеплоен** | `.github/workflows/sync-reviews.yml` — внешний крон каждые 10 мин (независим от pg_cron). Токен обновлён (workflow scope), запушен |
| **GitHub Secret нужен** | ⚠️ Добавить `SUPABASE_SERVICE_ROLE_KEY` в GitHub repo Settings → Secrets → Actions |
| **Questions UI улучшен** | Поля вопрос/ответ: `line-clamp-4 text-xs`. Кнопка "Открыть": предзаполняет replyText из existing draft |
| **Chats UI улучшен** | Хедер: имя покупателя вместо posting_number. Ссылка "Заказ X" ведёт на OZON Seller. Переключатель "По товару / По заказу" в левой панели |
| **Итог БД 17.03** | archived: 171,005 ✅ pending: 50 ✅ unanswered: 0 ✅ |

---

## Исправления сессии 9 (16.03.2026 — продолжение)

| Исправление | Детали |
|---|---|
| **Questions.tsx — ссылка на товар** | Использовал `question.external_id` (UUID вопроса), а не `products.external_id` (OZON product_id). Исправлено: fallback-цепочка `products.external_id → products.sku → search` |
| **Questions.tsx — колонка "Ответ"** | Добавлена колонка с текстом ответа (line-clamp-2, content из replies) |
| **Questions.tsx — массовые действия** | `handleBulkGenerate` (создаёт drafted replies через generate-reply), `handleBulkSend` (drafted → scheduled) |
| **230 пропавших отзывов** | НЕ баг. Система работает корректно: отзывы синкаются → автоответ генерируется → публикуется за ~1 мин → status=archived. OZON показывает их как "Новый" (непросмотренных) — это другой статус, не "unanswered". Для очистки статуса "Новый" в OZON нужно нажать "Отметить просмотренными" |
| **Chats.tsx — 2-панельный макет** | Полная переработка: левая панель (320px) со списком чатов + правая панель с перепиской. Фильтр-чипы: Активные/Все/Закрытые + Новые/Без вашего ответа/Без ответа клиента. Пузырьковая переписка, автоскролл, Enter для отправки |
| **pg_cron gap 14:50-14:57 UTC** | Коротков gap в 7 минут, cron восстановился сам. Пропущенные 8 отзывов синкнуты вручную |

---

## Исправления сессии 8 (16.03.2026)

| Исправление | Детали |
|---|---|
| **Счётчик "Не отвечено" расхождение с таблицей** | Причина: `ratingFilter` не сбрасывался при смене вкладки. Боковой счётчик считает без фильтра, таблица — с рейтингом. Исправлено в `Reviews.tsx`: добавлен `useEffect([statusFilter])` который сбрасывает `ratingFilter="all"` при смене вкладки |
| **Дюбель (SKU 3555227338) без product_id** | Продукт существует (`id: 7a09cc2b`, `offer_id: 201-0014_8`). Вопрос не был привязан т.к. sync не хранил sku. Исправлено: добавлена колонка `sku TEXT` в questions, v4 sync теперь сохраняет sku. SQL UPDATE: `UPDATE questions SET product_id = p.id FROM products p WHERE q.sku = p.sku...` — привязал 251 вопрос включая Дюбель |
| **sync-questions-api v4** | Теперь хранит `sku` в questions. Даёт возможность SQL-фикса для unmatched. |
| **Миграция 20260316000001** | `ALTER TABLE questions ADD COLUMN sku TEXT` + индекс |

---

## Исправления сессии 7 (15.03.2026)

| Исправление | Детали |
|---|---|
| **"Товар без названия" — ИСПРАВЛЕНО** | Soft-deleted отзывы (product_id IS NULL) появлялись в списке т.к. не было фильтра `deleted_at IS NULL`. Добавлено `.is("deleted_at", null)` в `Reviews.tsx` (countQuery + mainQuery) и `Questions.tsx` |
| **Questions.tsx — image_url** | Запрос `products!inner(name, marketplace_id)` не включал `image_url`. Добавлено: `products!inner(name, image_url, marketplace_id)` |
| **Дубли ответов — ИСПРАВЛЕНО** | Concurrent cron `auto-generate-drafts-background` (каждую минуту) порождал race condition → 2 инстанса находили один отзыв → оба создавали draft → оба публиковали. 9 отзывов имели по 2 published reply. Soft-deleted 387 дублей |
| **Unique partial index на replies** | `CREATE UNIQUE INDEX idx_unique_active_reply_per_review ON replies(review_id) WHERE deleted_at IS NULL AND review_id IS NOT NULL` — DB-level защита от дублей |
| **`sync-reviews-api` v8** | `ignoreDuplicates: true` вместо `false` → ON CONFLICT DO NOTHING (без UPDATE → без re-fire триггеров) |
| **Дублированный cron удалён** | `process-scheduled-replies-every-10min` удалён — оставлен только ежеминутный |
| **Дублированные триггеры удалены** | `review_segment_on_insert_update` и `trigger_update_review_segment_on_change` на таблице reviews |
| **Индекс производительности** | `CREATE INDEX idx_reviews_mp_seg_deleted_date ON reviews(marketplace_id, segment, review_date DESC) WHERE deleted_at IS NULL` |
| **Promise.all для Reviews.tsx** | count и data запросы теперь выполняются параллельно вместо последовательно |
| **Миграция применена** | `20260315000001_fix_duplicate_replies_and_cleanup.sql` применена к БД |
| **Коммит** | `ae477ba` — все изменения задеплоены |

---

## Исправления сессии 5 (10.03.2026)

| Исправление | Детали |
|---|---|
| **КРИТИЧЕСКИЙ БАГ: `sync-reviews-api` cursor** | Cursor всегда сбрасывался в NULL после каждого запуска (MAX_PAGES лимит = выход из loop → hasMore=false → cursor=null). Исправлено: cursor сохраняется при MAX_PAGES, сбрасывается только при has_next=false (реальный конец) |
| **Защита от "Товар без названия"** | При upsert: если SKU не найден в products → пропускаем review (не перезаписываем product_id в NULL) |
| **Курсор установлен** | reviews_sync_cursor → `019cc3c6...` (последний отзыв 06.03) → следующий запуск начал с новых отзывов |
| **auto-generate-drafts лимит** | Увеличен с 25 до 100 (шаблоны мгновенные, нет задержки 500мс) |
| **Старый pending отзыв 2023** | Archived (is_answered=true, segment=archived, черновик soft-deleted) |
| **1880 новых отзывов 07-10.03** | Синхронизированы, 53K опубликовано, процесс продолжается |
| **BUG: `update-reply-statuses` PostgREST лимит** | Функция читала первые 1000 из 57K+ отзывов → пропускала drafted replies. Исправлено: заменили fetch+batch на SQL RPC `bulk_update_reply_mode` и `bulk_update_reply_mode_questions` (прямой UPDATE с subquery). Задеплоено v2 |
| **Создана SQL RPC `bulk_update_reply_mode`** | Принимает (marketplace_id, rating, target_status, from_status). Делает bulk UPDATE replies напрямую в SQL. Нет ограничений PostgREST |
| **Создана SQL RPC `bulk_update_reply_mode_questions`** | То же для вопросов (без фильтра по rating) |
| **2 failed OZON 404 replies** | Soft-deleted, связанные reviews → archived (отзывы не существуют в OZON) |

## Исправления сессии 4 (06.03.2026)

| Исправление | Детали |
|---|---|
| `calculate_review_segment()` | Добавлен `'drafted'` в pending check. 284 отзыва moved unanswered→pending |
| `auto-generate-drafts` | Добавлен `.is("deleted_at", null)` в check существующих replies. 5 drafts created |
| `sync-questions-api` v2 | Cursor-based pagination, batch upsert, limit=100, убраны несуществующие колонки (raw, inserted_at) |
| `questions.product_id` | Сделан nullable (DROP NOT NULL) |
| `marketplaces.questions_sync_cursor` | Добавлена колонка для cursor-based pagination вопросов |
| `Questions.tsx` | Добавлен `.is("replies.deleted_at", null)` фильтр |
