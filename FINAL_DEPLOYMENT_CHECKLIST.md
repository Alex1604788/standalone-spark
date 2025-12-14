# ✅ Финальный чеклист деплоя OZON Performance API

## 📦 Версия кода: 2.0.0-final (2025-12-14)

---

## Шаг 1: Деплой кода в Supabase ⚠️ КРИТИЧНО

### 1.1. Откройте Supabase Dashboard
```
https://supabase.com/dashboard/project/nxymhkyvhcfcwjcfcbfy/functions/sync-ozon-performance
```

### 1.2. Получите код
**Вариант А** - Из GitHub (рекомендуется):
```
https://github.com/Alex1604788/standalone-spark/blob/claude/review-repository-015QiEMXVebETdBjXVAyQ98N/supabase/functions/sync-ozon-performance/index.ts
```
Нажмите "Raw" → Ctrl+A → Ctrl+C

**Вариант B** - Из локального файла:
```
supabase/functions/sync-ozon-performance/index.ts
```
Ctrl+A → Ctrl+C

### 1.3. Замените код в Supabase
1. Выделите ВЕСЬ старый код (Ctrl+A)
2. Удалите его (Delete)
3. Вставьте новый код (Ctrl+V)
4. Нажмите **Deploy**

### 1.4. Проверьте деплой ✅

После деплоя откройте функцию и проверьте:

**Строка 1-12** - Должен быть заголовок с версией:
```typescript
/**
 * OZON Performance API Sync Function
 * Version: 2.0.0-final
 * Date: 2025-12-14
```

**Строка 52-54** - Оптимизированные параметры polling:
```typescript
maxAttempts: number = 6,
initialDelay: number = 3000,
pollInterval: number = 2000
```

**Строка 69** - Status check с redirect follow:
```typescript
redirect: "follow",
```

**Строка 121** - Download с redirect follow:
```typescript
redirect: "follow",
```

**Строка 289** - Campaigns с redirect follow:
```typescript
redirect: "follow",
```

**Строка 300** - Обработка формата OZON API:
```typescript
const campaigns: OzonCampaign[] = campaignsData.list || campaignsData || [];
```

**Строка 370** - Token с redirect follow:
```typescript
redirect: "follow", // Follow redirects for token endpoint
```

**Строка 435** - ⚠️ САМОЕ ВАЖНОЕ - Sequential processing:
```typescript
const maxChunks = 1;  // MUST BE 1, not 4!
```

**Строка 448** - Report request с redirect follow:
```typescript
redirect: "follow",
```

### ✅ Если ВСЕ эти строки на месте - код задеплоен правильно!

---

## Шаг 2: Проверка учетных данных OZON

### 2.1. Выполните SQL проверку
Откройте Supabase SQL Editor и выполните:
```sql
-- Файл: CHECK_OZON_CREDENTIALS.sql
SELECT
  marketplace_id,
  api_type,
  client_id,
  LENGTH(client_secret) as secret_length,
  SUBSTRING(client_secret, 1, 10) || '...' as secret_preview,
  token_expires_at,
  created_at,
  updated_at
FROM marketplace_api_credentials
WHERE api_type = 'performance';
```

### 2.2. Проверьте формат
- **Client ID**: Должен выглядеть как число или UUID
- **Client Secret**: Длина должна быть 40+ символов (длинная строка)
- **api_type**: Должен быть именно 'performance' (не 'seller'!)

### ❌ Если учетные данные неправильные:
Обновите их в OZON Performance Dashboard:
```
https://performance.ozon.ru/
```
Раздел: API → Создать новые учетные данные

---

## Шаг 3: Первый тест синхронизации

### 3.1. Запустите тест
1. Откройте приложение: **Настройки → API OZON**
2. Нажмите **"За 7 дней"**
3. Откройте DevTools (F12) → вкладка **Network**
4. Найдите запрос к `sync-ozon-performance`
5. Посмотрите на **Response**

### 3.2. Ожидаемые результаты

#### ✅ Успех - Код работает, но нужен SQL fix:
```json
{
  "error": "Failed to save data",
  "details": "precision 0, scale 2 must round to absolute value less than 10^3",
  "version": "2.0.0-final",
  "build_date": "2025-12-14"
}
```
**Действие**: Переходите к Шагу 4 (SQL fix)

#### ✅ Успех - Частичная синхронизация:
```json
{
  "success": true,
  "message": "⚠️ Partial sync: processed 10 out of 340 campaigns",
  "partial_sync": true,
  "campaigns_total": 340,
  "campaigns_processed": 10,
  "campaigns_remaining": 330,
  "inserted": 42,
  "version": "2.0.0-final",
  "build_date": "2025-12-14"
}
```
**Действие**: Всё отлично! Запускайте синхронизацию повторно для обработки остальных кампаний

#### ❌ Ошибка - Старый код всё ещё работает:
```json
{
  "error": "...",
  "chunk": 2,
  "total_chunks": 4
}
```
**Действие**: Вернитесь к Шагу 1.4 - код не задеплоен!

#### ❌ Ошибка - Redirect loop:
```json
{
  "error": "Fetch failed: Maximum number of redirects (20) reached"
}
```
**Действие**: Вернитесь к Шагу 1.4 - код не задеплоен!

#### ❌ Ошибка - Неверные учетные данные:
```json
{
  "error": "invalid_client",
  "error_description": "Client authentication failed"
}
```
**Действие**: Вернитесь к Шагу 2 - проверьте учетные данные

---

## Шаг 4: SQL Fix для precision ⚠️ ОБЯЗАТЕЛЬНО

### 4.1. Когда выполнять
Если на Шаге 3 получили ошибку:
```
precision 0, scale 2 must round to absolute value less than 10^3
```

### 4.2. Выполните SQL
Откройте Supabase SQL Editor и выполните **ВСЕ 4 ШАГА**:

```sql
-- Файл: FIX_OZON_TABLE_PRECISION.sql

-- ШАГ 1: Удаляем view (временно)
DROP VIEW IF EXISTS public.promotion_costs_aggregated;

-- ШАГ 2: Увеличиваем precision для процентных метрик
ALTER TABLE public.ozon_performance_daily
  ALTER COLUMN ctr TYPE DECIMAL(10, 2),
  ALTER COLUMN conversion TYPE DECIMAL(10, 2),
  ALTER COLUMN add_to_cart_conversion TYPE DECIMAL(10, 2),
  ALTER COLUMN drr TYPE DECIMAL(10, 2);

-- ШАГ 3: Пересоздаём view
CREATE OR REPLACE VIEW public.promotion_costs_aggregated AS
SELECT
  marketplace_id,
  stat_date as cost_date,
  offer_id,
  sku,
  SUM(money_spent) as promotion_cost,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders) as total_orders,
  SUM(revenue) as total_revenue,
  AVG(ctr) as avg_ctr,
  AVG(cpc) as avg_cpc,
  AVG(conversion) as avg_conversion,
  AVG(drr) as avg_drr,
  MIN(imported_at) as first_imported_at,
  MAX(imported_at) as last_imported_at
FROM public.ozon_performance_daily
GROUP BY marketplace_id, stat_date, offer_id, sku;

-- ШАГ 4: Восстанавливаем права доступа
GRANT SELECT ON public.promotion_costs_aggregated TO authenticated;
```

### 4.3. Проверка выполнения
Должно выполниться успешно без ошибок. Если ошибка - скопируйте и покажите мне.

---

## Шаг 5: Финальный тест

### 5.1. Запустите синхронизацию снова
После SQL fix запустите **"За 7 дней"** ещё раз

### 5.2. Ожидаемый результат ✅
```json
{
  "success": true,
  "message": "⚠️ Partial sync: processed 10 out of 340 campaigns. Run sync again to continue.",
  "partial_sync": true,
  "campaigns_total": 340,
  "campaigns_processed": 10,
  "campaigns_remaining": 330,
  "inserted": 42,
  "version": "2.0.0-final",
  "build_date": "2025-12-14"
}
```

### 5.3. Проверьте данные в базе
```sql
SELECT
  COUNT(*) as total_records,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date,
  SUM(money_spent) as total_spent,
  SUM(clicks) as total_clicks,
  SUM(orders) as total_orders
FROM public.ozon_performance_daily
WHERE imported_at > NOW() - INTERVAL '10 minutes';
```

Должны увидеть записи с данными за последние 7 дней.

---

## Шаг 6: Полная синхронизация всех кампаний

### 6.1. Запустите синхронизацию несколько раз
Так как обрабатывается только 10 кампаний за раз, нужно запустить синхронизацию:
```
Количество запусков = ОКРУГЛИТЬ ВВЕРХ(campaigns_total / 10)
```

Пример:
- Если `campaigns_total: 340`, нужно **34 запуска**
- Если `campaigns_total: 85`, нужно **9 запусков**

### 6.2. Как понять, что всё обработано
Когда получите ответ **БЕЗ** `partial_sync`:
```json
{
  "success": true,
  "message": "Successfully synced OZON Performance data",
  "campaigns_total": 340,
  "campaigns_processed": 340,
  "inserted": 1420,
  "version": "2.0.0-final",
  "build_date": "2025-12-14"
}
```

---

## 📊 Критерии успеха

### ✅ Деплой успешен, если:
- [x] В коде видна версия "2.0.0-final"
- [x] Строка 435: `const maxChunks = 1;`
- [x] Все endpoints используют `redirect: "follow"`
- [x] Ответ API содержит `"version": "2.0.0-final"`

### ✅ Синхронизация успешна, если:
- [x] Нет ошибок "chunk", "total_chunks", "redirect loop"
- [x] Данные сохраняются в `ozon_performance_daily`
- [x] Нет ошибок precision
- [x] Частичная синхронизация показывает прогресс (10 кампаний за раз)

### ✅ Данные корректны, если:
- [x] Записи появляются в таблице `ozon_performance_daily`
- [x] View `promotion_costs_aggregated` работает
- [x] Даты соответствуют выбранному периоду
- [x] Метрики (CTR, DRR, конверсия) сохраняются без ошибок

---

## 🆘 Troubleshooting

### Проблема: "chunk": 2, "total_chunks": 4
**Причина**: Старый код всё ещё работает
**Решение**: Вернитесь к Шагу 1.4, проверьте строку 435

### Проблема: "Maximum number of redirects (20)"
**Причина**: Код не использует `redirect: "follow"`
**Решение**: Вернитесь к Шагу 1.4, проверьте все endpoints

### Проблема: "campaigns.forEach is not a function"
**Причина**: Код не обрабатывает формат `{list: [...]}`
**Решение**: Вернитесь к Шагу 1.4, проверьте строку 300

### Проблема: "invalid_client"
**Причина**: Неверные Client ID или Client Secret
**Решение**: Шаг 2 - проверьте учетные данные в OZON Performance

### Проблема: "precision 0, scale 2..."
**Причина**: SQL fix не выполнен
**Решение**: Шаг 4 - выполните SQL fix

---

## 📝 Версии и изменения

### Версия 2.0.0-final (2025-12-14)
**Критичные исправления**:
- ✅ Sequential processing: `maxChunks = 1` (было 4)
- ✅ Все endpoints используют `redirect: "follow"` (было "manual")
- ✅ Обработка формата `{list: [...]}` для campaigns
- ✅ Оптимизированный polling: 13s (было 35s)
- ✅ Версионирование ответов API

**Документация**:
- `OZON_SYNC_FIXES_APPLIED.md` - Детальное описание исправлений
- `DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md` - Подробная инструкция по деплою
- `CHECK_OZON_CREDENTIALS.sql` - Проверка учетных данных
- `FIX_OZON_TABLE_PRECISION.sql` - SQL fix для precision

---

## 🎯 Быстрый старт (для опытных)

1. Скопируйте код из GitHub в Supabase Dashboard
2. Проверьте строку 435: `const maxChunks = 1;`
3. Deploy
4. Выполните `FIX_OZON_TABLE_PRECISION.sql`
5. Запустите "За 7 дней"
6. Проверьте ответ - должен быть `"version": "2.0.0-final"`
7. Запускайте синхронизацию повторно, пока `campaigns_remaining > 0`

Готово! ✅
