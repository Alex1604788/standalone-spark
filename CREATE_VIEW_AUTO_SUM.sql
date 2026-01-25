-- =====================================================
-- СОЗДАНИЕ VIEW ДЛЯ АВТОМАТИЧЕСКОГО СУММИРОВАНИЯ
-- orders + orders_model и revenue + revenue_model
-- =====================================================
-- После создания этого VIEW, вы сможете просто делать:
-- SELECT * FROM ozon_performance_summary
-- И получать уже готовые суммы без дополнительных расчетов
-- =====================================================

-- Удаляем старый VIEW если существует
DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE;

-- Создаем новый VIEW с автоматическим суммированием
CREATE OR REPLACE VIEW public.ozon_performance_summary AS
SELECT
  id,
  marketplace_id,
  stat_date,
  sku,
  offer_id,
  campaign_id,
  campaign_name,
  campaign_type,

  -- ИСХОДНЫЕ ДАННЫЕ (как есть из таблицы)
  money_spent,
  views,
  clicks,
  orders,
  orders_model,
  revenue,
  revenue_model,
  add_to_cart,
  avg_bill,

  -- ✨ АВТОМАТИЧЕСКОЕ СУММИРОВАНИЕ ✨
  -- Эти поля будут автоматически рассчитываться
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,

  -- Пересчитанные метрики с учетом total_orders и total_revenue
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

  -- Метаданные
  imported_at,
  import_batch_id

FROM public.ozon_performance_daily;

-- Даем доступ authenticated пользователям
GRANT SELECT ON public.ozon_performance_summary TO authenticated;

-- Создаем комментарии для документации
COMMENT ON VIEW public.ozon_performance_summary IS
'Представление с автоматическим суммированием orders + orders_model и revenue + revenue_model.
Используйте этот VIEW вместо прямого запроса к ozon_performance_daily для получения итоговых метрик.';

COMMENT ON COLUMN public.ozon_performance_summary.total_orders IS
'Автоматическая сумма: orders + orders_model';

COMMENT ON COLUMN public.ozon_performance_summary.total_revenue IS
'Автоматическая сумма: revenue + revenue_model';

-- =====================================================
-- ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ
-- =====================================================

-- 1. Получить все данные с готовыми суммами
-- SELECT * FROM ozon_performance_summary
-- WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
-- ORDER BY stat_date DESC;

-- 2. Агрегация по дням
-- SELECT
--   stat_date,
--   SUM(total_orders) as orders_total,
--   SUM(total_revenue) as revenue_total,
--   SUM(money_spent) as spent_total
-- FROM ozon_performance_summary
-- GROUP BY stat_date
-- ORDER BY stat_date DESC;

-- 3. Агрегация по кампаниям
-- SELECT
--   campaign_name,
--   SUM(total_orders) as orders,
--   SUM(total_revenue) as revenue,
--   SUM(money_spent) as spent,
--   ROUND(AVG(roi), 1) as avg_roi
-- FROM ozon_performance_summary
-- WHERE stat_date >= CURRENT_DATE - INTERVAL '30 days'
-- GROUP BY campaign_name
-- ORDER BY revenue DESC;

-- =====================================================
-- ✅ ГОТОВО!
-- =====================================================
-- Теперь просто используйте ozon_performance_summary
-- вместо ozon_performance_daily во всех запросах.
--
-- Все суммы (orders + orders_model, revenue + revenue_model)
-- будут рассчитываться АВТОМАТИЧЕСКИ!
-- =====================================================
