# Деплой OZON Performance API v2.1.0-zip-support

## 🎯 Что исправлено

### ✅ Главные изменения:

1. **ZIP архивы теперь поддерживаются!**
   - Добавлена автоматическая распаковка ZIP архивов от OZON API
   - Поддержка content-type: `application/zip` и `application/octet-stream`
   - Извлечение CSV файлов из архива

2. **campaign_id теперь заполняется правильно!**
   - Раньше: `campaign_id = ''` (пустая строка)
   - Теперь: извлекается из метаданных кампании
   - Также сохраняются `campaign_name` и `campaign_type`

3. **Улучшен парсинг CSV:**
   - Извлечение даты из CSV (DD.MM.YYYY → YYYY-MM-DD)
   - Парсинг дополнительных метрик: `add_to_cart`, `avg_bill`
   - Лучшая обработка числовых значений

4. **Обработка множества кампаний:**
   - Корректная работа с 30+ кампаниями
   - Каждая кампания обрабатывается отдельно с сохранением метаданных

---

## 📦 Шаги деплоя

### Шаг 1: Откройте Supabase Dashboard

```
https://supabase.com/dashboard/project/nxymhkyvhcfcwjcfcbfy/functions/sync-ozon-performance
```

### Шаг 2: Замените код функции

**Откройте файл на GitHub:**
```
https://github.com/Alex1604788/standalone-spark/blob/claude/ozon-performance-zip-support-hN0XE/supabase/functions/sync-ozon-performance/index.ts
```

**Или используйте локальный файл:**
```
/home/user/standalone-spark/supabase/functions/sync-ozon-performance/index.ts
```

**Действия:**
1. Нажмите "Raw" на GitHub (или откройте локальный файл)
2. Выделите **весь код** (Ctrl+A)
3. Скопируйте (Ctrl+C)
4. Вставьте в Supabase Editor (Ctrl+V, заменив старый код)
5. Нажмите **Deploy**

### Шаг 3: Проверьте версию

После деплоя откройте функцию и проверьте **строки 1-13**:

```typescript
/**
 * OZON Performance API Sync Function
 * Version: 2.1.0-zip-support    ← Должно быть 2.1.0
 * Date: 2025-12-15
 *
 * Key features:
 * - ZIP archive extraction support    ← Новая возможность!
 * - Sequential processing (1 chunk = 10 campaigns max)
 * - Async report generation with UUID polling
 * - Sync history tracking for partial sync support
 * - All OZON endpoints use redirect: "follow" for 307 redirects
 * - Proper campaign_id extraction from reports    ← Исправлено!
 */
```

**Строка 17** должна содержать:
```typescript
import { unzip } from "https://deno.land/x/zip@v1.2.5/mod.ts";
```

**Строка 55-59** должна содержать:
```typescript
interface CampaignInfo {
  id: string;
  name: string;
  type: string;
}
```

**Строка 146** должна содержать:
```typescript
} else if (contentType.includes("application/zip") || contentType.includes("application/octet-stream")) {
```

---

## ✅ Шаг 4: Протестируйте

### 4.1. Проверьте подключение

1. Откройте приложение: **Настройки → API OZON**
2. Нажмите **"Проверить подключение"**
3. Должно вернуть:
```json
{
  "success": true,
  "message": "Connection successful",
  "token_obtained": true,
  "version": "2.1.0-zip-support",    ← Проверьте версию!
  "build_date": "2025-12-15"
}
```

### 4.2. Запустите синхронизацию

1. Нажмите **"За 7 дней"**
2. Откройте DevTools (F12) → Network
3. Найдите запрос `sync-ozon-performance`
4. Проверьте Response

**Ожидаемый успешный ответ:**
```json
{
  "success": true,
  "message": "Synchronization completed",
  "period": { "from": "2025-12-08", "to": "2025-12-15" },
  "campaigns": 30,     ← Количество кампаний
  "chunks_processed": 1,
  "inserted": 150,     ← Количество записей
  "sync_id": "...",
  "version": "2.1.0-zip-support",
  "build_date": "2025-12-15"
}
```

### 4.3. Проверьте данные в БД

Выполните в Supabase SQL Editor:

```sql
-- Проверка последних записей
SELECT
  stat_date,
  sku,
  campaign_id,      -- Теперь НЕ NULL!
  campaign_name,    -- Заполнено!
  campaign_type,    -- Заполнено!
  money_spent,
  views,
  clicks,
  orders,
  revenue
FROM ozon_performance_daily
WHERE marketplace_id = '8d51d87d-a75d-487a-9b8d-29458183f182'
  AND campaign_id IS NOT NULL    -- Проверяем что campaign_id заполнен!
ORDER BY stat_date DESC
LIMIT 20;
```

**Результат должен показать:**
- ✅ `campaign_id` **НЕ NULL** (заполнен!)
- ✅ `campaign_name` заполнено
- ✅ `campaign_type` заполнено
- ✅ Данные за последние 7 дней

---

## 🚀 Что дальше?

### Для Sales Analytics

Теперь таблица `ozon_performance_daily` готова для использования в Sales Analytics:

```sql
-- Затраты на продвижение за период
SELECT
  offer_id,
  SUM(money_spent) as total_promotion_cost
FROM ozon_performance_daily
WHERE marketplace_id = '8d51d87d-a75d-487a-9b8d-29458183f182'
  AND stat_date BETWEEN '2025-12-01' AND '2025-12-15'
GROUP BY offer_id;
```

Или через VIEW:
```sql
SELECT
  offer_id,
  SUM(promotion_cost) as total_cost
FROM promotion_costs_aggregated
WHERE marketplace_id = '8d51d87d-a75d-487a-9b8d-29458183f182'
  AND cost_date BETWEEN '2025-12-01' AND '2025-12-15'
GROUP BY offer_id;
```

### UI для кастомного периода

Сейчас в UI есть только кнопки "За 7 дней", "За 30 дней", "За 90 дней".

Для добавления выбора кастомного периода нужно:
1. Добавить date pickers в `OzonApiSettings.tsx`
2. Передавать `start_date` и `end_date` в Edge Function

---

## 🐛 Troubleshooting

### Ошибка: "Skipping malformed line: C=7��hp..."

**Причина:** Старая версия функции без поддержки ZIP.
**Решение:** Задеплойте новую версию v2.1.0-zip-support.

### Ошибка: "No UUID received"

**Причина:** Проблема с OZON API или credentials.
**Решение:**
1. Проверьте credentials в БД
2. Проверьте есть ли активные кампании в OZON Performance Dashboard

### campaign_id = NULL в БД

**Причина:** Используется старая версия функции.
**Решение:** Задеплойте v2.1.0-zip-support и запустите синхронизацию снова.

### Синхронизируется только 10 кампаний из 30+

**Причина:** Лимит OZON API - максимум 10 кампаний за запрос.
**Решение:** Запустите синхронизацию несколько раз подряд для обработки всех кампаний.

---

## 📝 Changelog

### v2.1.0-zip-support (2025-12-15)

**Добавлено:**
- Поддержка ZIP архивов (unzip library)
- Извлечение campaign_id, campaign_name, campaign_type из метаданных
- Парсинг дополнительных метрик (add_to_cart, avg_bill)
- Извлечение даты из CSV (DD.MM.YYYY → YYYY-MM-DD)

**Исправлено:**
- campaign_id теперь заполняется корректно (не пустая строка)
- Обработка content-type: application/octet-stream
- Улучшена обработка множества кампаний

**Изменено:**
- Версия: 2.0.0-final → 2.1.0-zip-support
- Добавлен интерфейс CampaignInfo

---

## ✅ Проверочный чеклист

- [ ] Код задеплоен в Supabase Edge Functions
- [ ] Версия показывает `2.1.0-zip-support`
- [ ] Импорт `unzip` присутствует (строка 17)
- [ ] Интерфейс `CampaignInfo` добавлен (строка 55)
- [ ] Проверка ZIP архивов работает (строка 146)
- [ ] Тест подключения возвращает версию 2.1.0
- [ ] Синхронизация "За 7 дней" работает без ошибок
- [ ] В БД campaign_id заполнен (НЕ NULL)
- [ ] В БД campaign_name и campaign_type заполнены

---

**Ветка с изменениями:**
```
claude/ozon-performance-zip-support-hN0XE
```

**Commit:**
```
e38af80 - Add ZIP archive support and fix campaign_id parsing in OZON Performance API sync
```

**GitHub:**
```
https://github.com/Alex1604788/standalone-spark/tree/claude/ozon-performance-zip-support-hN0XE
```
