-- =====================================================
-- FIX: Увеличение precision для процентных полей
-- (с учётом зависимости от view)
-- =====================================================
-- Проблема: View promotion_costs_aggregated зависит от этих колонок
-- Решение: Удаляем view → Меняем колонки → Пересоздаём view
--
-- Выполните в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nxymhkyvhcfcwjcfcbfy/sql/new
-- =====================================================

-- ШАГ 1: Удаляем view (временно)
DROP VIEW IF EXISTS public.promotion_costs_aggregated;

-- ШАГ 2: Увеличиваем precision для процентных метрик
ALTER TABLE public.ozon_performance_daily
  ALTER COLUMN ctr TYPE DECIMAL(10, 2),
  ALTER COLUMN conversion TYPE DECIMAL(10, 2),
  ALTER COLUMN add_to_cart_conversion TYPE DECIMAL(10, 2),
  ALTER COLUMN drr TYPE DECIMAL(10, 2);

-- ШАГ 3: Пересоздаём view с теми же параметрами
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

-- ШАГ 5: Проверяем результат
SELECT
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ozon_performance_daily'
  AND column_name IN ('ctr', 'conversion', 'add_to_cart_conversion', 'drr')
ORDER BY column_name;

-- ✅ Ожидаемый результат:
-- add_to_cart_conversion | numeric | 10 | 2
-- conversion             | numeric | 10 | 2
-- ctr                    | numeric | 10 | 2
-- drr                    | numeric | 10 | 2
