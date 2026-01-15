-- Create VIEW for ozon_performance_summary with automatic sum calculations
-- This VIEW is used by the application to display promotion analytics data

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
