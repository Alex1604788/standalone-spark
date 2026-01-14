# 🚨 КРИТИЧНО: ПРИМЕНИТЬ VIEW ДЛЯ ВОССТАНОВЛЕНИЯ ДАННЫХ

## 🔍 ПРОБЛЕМА:

❌ **Данные пропали из приложения** потому что VIEW `ozon_performance_summary` не был применен к базе данных.

✅ **Данные ЕСТЬ в Supabase** в таблице `ozon_performance_daily`, но приложение их не видит.

---

## ⚡ БЫСТРОЕ РЕШЕНИЕ (5 минут):

### Шаг 1: Откройте Supabase SQL Editor

👉 **Перейдите по ссылке:**
https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new

### Шаг 2: Скопируйте SQL код

Откройте файл `VIEW_TO_APPLY.sql` в корне проекта и скопируйте **ВСЁ** его содержимое.

Или скопируйте прямо отсюда:

\`\`\`sql
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
  avg_bill,
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,
  CASE
    WHEN views > 0 THEN ROUND((clicks::NUMERIC / views) * 100, 2)
    ELSE 0
  END AS ctr,
  CASE
    WHEN clicks > 0 THEN ROUND(money_spent / clicks, 2)
    ELSE 0
  END AS cpc,
  CASE
    WHEN clicks > 0 THEN ROUND(((COALESCE(orders, 0) + COALESCE(orders_model, 0))::NUMERIC / clicks) * 100, 2)
    ELSE 0
  END AS conversion,
  CASE
    WHEN (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((money_spent / (COALESCE(revenue, 0) + COALESCE(revenue_model, 0))) * 100, 2)
    ELSE NULL
  END AS drr,
  CASE
    WHEN money_spent > 0 AND (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) - money_spent) / money_spent) * 100, 2)
    ELSE NULL
  END AS roi,
  CASE
    WHEN (COALESCE(orders, 0) + COALESCE(orders_model, 0)) > 0
    THEN ROUND((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) / (COALESCE(orders, 0) + COALESCE(orders_model, 0)), 2)
    ELSE NULL
  END AS avg_order_value,
  imported_at,
  import_batch_id
FROM public.ozon_performance_daily;

GRANT SELECT ON public.ozon_performance_summary TO authenticated;

COMMENT ON VIEW public.ozon_performance_summary IS 'Представление с автоматическим суммированием orders + orders_model и revenue + revenue_model. Используйте этот VIEW вместо прямого запроса к ozon_performance_daily для получения итоговых метрик.';

COMMENT ON COLUMN public.ozon_performance_summary.total_orders IS 'Автоматическая сумма: orders + orders_model';

COMMENT ON COLUMN public.ozon_performance_summary.total_revenue IS 'Автоматическая сумма: revenue + revenue_model';
\`\`\`

### Шаг 3: Вставьте и выполните

1. Вставьте скопированный SQL в SQL Editor
2. Нажмите кнопку **"Run"** (▶️) или нажмите `Ctrl+Enter`
3. Должно появиться сообщение: ✅ **"Success. No rows returned"**

### Шаг 4: Проверьте что VIEW создан

Выполните в SQL Editor:

\`\`\`sql
SELECT COUNT(*) FROM ozon_performance_summary;
\`\`\`

Если вернулось число (например, `count: 1234`), значит VIEW работает! ✅

---

## 🎯 ЧТО ПРОИЗОЙДЕТ ПОСЛЕ ПРИМЕНЕНИЯ:

✅ **Данные появятся в приложении** в разделе "Аналитика Продвижений"
✅ Автоматическое суммирование `orders + orders_model` → `total_orders`
✅ Автоматическое суммирование `revenue + revenue_model` → `total_revenue`
✅ Все метрики (CTR, CPC, конверсия, ДРР, ROI) будут рассчитываться автоматически

---

## 🔍 КАК ПРОВЕРИТЬ ЧТО ВСЁ РАБОТАЕТ:

После применения VIEW:

1. **Обновите страницу приложения** (F5)
2. Перейдите в раздел **"Аналитика Продвижений"**
3. Данные должны отображаться в таблице

Или проверьте через SQL:

\`\`\`sql
-- Получить данные за последние 7 дней
SELECT
  stat_date,
  campaign_name,
  SUM(total_orders) as total_orders,
  SUM(total_revenue) as total_revenue,
  SUM(money_spent) as money_spent
FROM ozon_performance_summary
WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY stat_date, campaign_name
ORDER BY stat_date DESC
LIMIT 10;
\`\`\`

---

## ❓ ЕСЛИ ЧТО-ТО ПОШЛО НЕ ТАК:

### Ошибка: "relation does not exist"
→ VIEW не создан, повторите Шаг 2-3

### Ошибка: "permission denied"
→ Убедитесь, что вы залогинены в Supabase Dashboard

### Данные всё равно не появились
→ Проверьте, есть ли данные в базовой таблице:
\`\`\`sql
SELECT COUNT(*) FROM ozon_performance_daily;
\`\`\`
Если `count: 0`, нужно запустить синхронизацию OZON.

---

## 📞 ПОДДЕРЖКА:

Если после применения VIEW данные всё равно не появились, сообщите мне и я помогу!

---

**⚡ ПРИМЕНИТЬ VIEW НУЖНО ПРЯМО СЕЙЧАС!** ⚡
