# 🚨 КРИТИЧНО: Данные не грузятся из-за отсутствия VIEW

## Проблема

Аналитика продвижений показывает "Нет данных за выбранный период" потому что:

❌ **VIEW `ozon_performance_summary` НЕ ПРИМЕНЕН К БАЗЕ ДАННЫХ**

Миграция существует в файлах проекта, но не была выполнена в Supabase.

---

## ⚡ СРОЧНОЕ РЕШЕНИЕ (2 минуты)

### Вариант 1: Через Supabase Dashboard (РЕКОМЕНДУЕТСЯ)

1. **Откройте Supabase SQL Editor:**
   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new

2. **Скопируйте и выполните этот SQL:**

```sql
-- Пересоздаем VIEW с правами доступа
DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE;

CREATE VIEW public.ozon_performance_summary AS
SELECT
  id,
  marketplace_id,
  stat_date,
  sku,
  offer_id,
  campaign_id,
  campaign_name,
  campaign_type,
  money_spent,
  views,
  clicks,
  orders,
  orders_model,
  revenue,
  revenue_model,
  add_to_cart,
  add_to_cart_conversion,
  favorites,
  avg_bill,

  -- Автоматическое суммирование
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,

  -- Рассчитанные метрики
  CASE WHEN views > 0 THEN ROUND((clicks::NUMERIC / views) * 100, 2) ELSE 0 END AS ctr,
  CASE WHEN clicks > 0 THEN ROUND(money_spent / clicks, 2) ELSE 0 END AS cpc,
  CASE WHEN clicks > 0 THEN ROUND(((COALESCE(orders, 0) + COALESCE(orders_model, 0))::NUMERIC / clicks) * 100, 2) ELSE 0 END AS conversion,
  CASE
    WHEN (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((money_spent / (COALESCE(revenue, 0) + COALESCE(revenue_model, 0))) * 100, 2)
    ELSE NULL
  END AS drr,

  imported_at,
  import_batch_id
FROM public.ozon_performance_daily;

-- Даем права доступа
GRANT SELECT ON public.ozon_performance_summary TO authenticated;
GRANT SELECT ON public.ozon_performance_summary TO anon;

-- Проверяем что VIEW создан
SELECT COUNT(*) as total_records FROM ozon_performance_summary;
```

3. **Нажмите RUN (▶️)** или `Ctrl+Enter`

4. **Проверьте результат:**
   - Должно появиться `Success`
   - В конце должно вернуться число записей (например `total_records: 1234`)

### Вариант 2: Через Supabase CLI

```bash
cd /home/user/standalone-spark
npx supabase db push
```

---

## ✅ Что произойдет после применения

1. **Данные сразу появятся** в разделе "Аналитика Продвижения"
2. Автоматическое суммирование `orders + orders_model` → `total_orders`
3. Автоматическое суммирование `revenue + revenue_model` → `total_revenue`
4. Все метрики будут рассчитываться автоматически

---

## 🔍 Проверка после применения

1. Обновите страницу приложения (F5)
2. Откройте "Аналитика Продвижения"
3. Данные должны загрузиться

Если данные НЕ появились:
- Проверьте консоль браузера (F12) на ошибки
- Проверьте, есть ли данные: выполните в SQL Editor:
  ```sql
  SELECT COUNT(*) FROM ozon_performance_daily;
  ```
  Если вернулось 0 - нужно запустить синхронизацию OZON Performance

---

## 📊 Дополнительная диагностика

Если VIEW применен, но данных всё равно нет, проверьте:

```sql
-- 1. Есть ли данные в базовой таблице?
SELECT COUNT(*) FROM ozon_performance_daily;

-- 2. За какие даты есть данные?
SELECT MIN(stat_date), MAX(stat_date), COUNT(*)
FROM ozon_performance_daily;

-- 3. Для каких marketplace_id есть данные?
SELECT marketplace_id, COUNT(*) as records
FROM ozon_performance_daily
GROUP BY marketplace_id;

-- 4. Ваш marketplace_id (из таблицы marketplaces)
SELECT id, user_id, name FROM marketplaces;
```

---

## ⚠️ ЕСЛИ ПРОБЛЕМА ОСТАЛАСЬ

После применения VIEW, если данных всё равно нет:

1. **Нет данных в базовой таблице** → Нужно запустить синхронизацию:
   - Откройте раздел "Настройки → API OZON Продвижения"
   - Нажмите кнопку "Синхронизировать"

2. **Данные есть, но для другого marketplace_id** → Проверьте что пользователь авторизован и его marketplace_id совпадает

3. **Период дат не содержит данных** → Измените период в фильтрах на более широкий (например, последние 180 дней)

---

**⚡ ДЕЙСТВУЙТЕ ПРЯМО СЕЙЧАС! Это займет 2 минуты и решит проблему. ⚡**
