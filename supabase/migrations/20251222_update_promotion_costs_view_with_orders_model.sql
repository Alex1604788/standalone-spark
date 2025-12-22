-- =====================================================
-- Migration: Update promotion_costs_aggregated view to sum orders + orders_model
-- Date: 2025-12-22
-- Description: OZON в аналитике складывает "Заказы" + "Заказы модели"
--              Обновляем view чтобы total_orders включал оба значения
-- =====================================================

-- Пересоздаем view с обновленной логикой
CREATE OR REPLACE VIEW public.promotion_costs_aggregated AS
SELECT
  marketplace_id,
  stat_date as cost_date,
  offer_id,
  sku,
  SUM(money_spent) as promotion_cost,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders + COALESCE(orders_model, 0)) as total_orders,  -- ВАЖНО: Суммируем orders + orders_model как в OZON
  SUM(revenue) as total_revenue,
  AVG(ctr) as avg_ctr,
  AVG(cpc) as avg_cpc,
  AVG(conversion) as avg_conversion,
  AVG(drr) as avg_drr,
  MIN(imported_at) as first_imported_at,
  MAX(imported_at) as last_imported_at
FROM public.ozon_performance_daily
GROUP BY marketplace_id, stat_date, offer_id, sku;

-- Обновляем комментарий к view
COMMENT ON VIEW public.promotion_costs_aggregated IS 'Агрегированные данные из ozon_performance_daily. total_orders = Заказы + Заказы модели (как в аналитике OZON). Updated 2025-12-22';

-- Grant access to view
GRANT SELECT ON public.promotion_costs_aggregated TO authenticated;
GRANT SELECT ON public.promotion_costs_aggregated TO service_role;

-- Verify view was updated
SELECT
  schemaname,
  viewname,
  viewowner
FROM pg_views
WHERE viewname = 'promotion_costs_aggregated';
