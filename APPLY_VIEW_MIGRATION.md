# 🔧 ПРИМЕНЕНИЕ МИГРАЦИИ VIEW

## ❌ Проблема обнаружена

VIEW `ozon_performance_summary` **НЕ СУЩЕСТВУЕТ** в базе данных.

Ошибка: `Could not find the table 'public.ozon_performance_summary' in the schema cache`

---

## ✅ РЕШЕНИЕ: Применить миграцию

### Способ 1: Через Supabase SQL Editor (Рекомендуется)

1. Откройте Supabase SQL Editor:
   ```
   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql
   ```

2. Откройте файл миграции:
   ```
   supabase/migrations/20260112000000_create_ozon_performance_summary_view.sql
   ```

3. Скопируйте **ВЕСЬ** код из файла

4. Вставьте в SQL Editor

5. Нажмите **RUN** ▶️

6. Вы должны увидеть:
   ```
   Success. No rows returned
   ```

---

### Способ 2: Через Supabase CLI

Если у вас настроен Supabase CLI с доступом к remote:

```bash
# Применить все непримененные миграции
supabase db push --linked

# Или применить конкретную миграцию
psql $DATABASE_URL < supabase/migrations/20260112000000_create_ozon_performance_summary_view.sql
```

---

## 🔍 Проверка что VIEW создан

После применения миграции выполните:

```sql
-- Проверить существование VIEW
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name = 'ozon_performance_summary';

-- Должно вернуть:
-- table_name: ozon_performance_summary
-- table_type: VIEW
```

Или через REST API:

```bash
curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

Если VIEW существует, вернётся массив с данными:
```json
[{"id":"...","total_orders":123,...}]
```

---

## 📋 Что делает эта миграция?

Создаёт VIEW `ozon_performance_summary` который:

✅ Автоматически суммирует `orders + orders_model` → `total_orders`
✅ Автоматически суммирует `revenue + revenue_model` → `total_revenue`
✅ Пересчитывает метрики (CTR, CPC, конверсия, ДРР, ROI)
✅ Даёт доступ authenticated пользователям

После создания VIEW, вместо:
```sql
SELECT orders + orders_model as total FROM ozon_performance_daily
```

Можно делать:
```sql
SELECT total_orders FROM ozon_performance_summary
```

---

## 🚀 После применения миграции

Запустите проверку чтобы убедиться что всё работает:

```bash
node check-sync-status.mjs
```

Или используйте SQL скрипт:
```sql
-- Проверка суммирования
SELECT
  stat_date,
  SUM(orders) as orders,
  SUM(orders_model) as orders_model,
  SUM(total_orders) as total_from_view
FROM ozon_performance_summary
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY stat_date
ORDER BY stat_date DESC
LIMIT 5;
```

Если `total_from_view` = `orders + orders_model`, значит VIEW работает правильно! ✅

---

## ⚠️ ВАЖНО

VIEW нужно применить **ОБЯЗАТЕЛЬНО**, иначе:
- ❌ Фронтенд не сможет получить данные
- ❌ Придётся суммировать вручную в каждом запросе
- ❌ Отчёты будут неполными

---

**Примените миграцию сейчас!** 🚀
