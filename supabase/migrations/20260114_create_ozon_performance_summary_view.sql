-- =====================================================
-- Migration: Create ozon_performance_summary VIEW
-- Date: 2026-01-14
-- Description: VIEW для страницы "Аналитика Продвижения"
--              Показывает агрегированные данные по дням и кампаниям
-- =====================================================

-- Создаем VIEW с агрегированными данными для аналитики продвижения
CREATE OR REPLACE VIEW public.ozon_performance_summary AS
SELECT
  marketplace_id,
  stat_date,
  campaign_id,
  campaign_name,
  campaign_type,
  -- Суммируем orders + orders_model как в OZON Analytics
  SUM(orders + COALESCE(orders_model, 0)) as total_orders,
  -- Суммируем revenue
  SUM(COALESCE(revenue, 0)) as total_revenue,
  -- Суммируем расходы
  SUM(money_spent) as money_spent,
  -- Суммируем показы, клики
  SUM(views) as views,
  SUM(clicks) as clicks,
  -- Дополнительные метрики
  SUM(COALESCE(add_to_cart, 0)) as add_to_cart,
  SUM(COALESCE(favorites, 0)) as favorites,
  -- Средние значения
  AVG(COALESCE(ctr, 0)) as avg_ctr,
  AVG(COALESCE(cpc, 0)) as avg_cpc,
  AVG(COALESCE(conversion, 0)) as avg_conversion,
  AVG(COALESCE(drr, 0)) as avg_drr,
  -- Метаданные
  COUNT(*) as products_count,  -- Количество товаров в кампании
  MIN(imported_at) as first_imported_at,
  MAX(imported_at) as last_imported_at
FROM public.ozon_performance_daily
GROUP BY marketplace_id, stat_date, campaign_id, campaign_name, campaign_type;

-- Добавляем комментарий
COMMENT ON VIEW public.ozon_performance_summary IS
'VIEW для страницы Аналитика Продвижения. Агрегирует данные по дням и кампаниям. total_orders = orders + orders_model (как в OZON Analytics)';

-- Даем права доступа
GRANT SELECT ON public.ozon_performance_summary TO authenticated;
GRANT SELECT ON public.ozon_performance_summary TO service_role;

-- Проверяем что VIEW создан
SELECT
  schemaname,
  viewname,
  viewowner
FROM pg_views
WHERE viewname = 'ozon_performance_summary';
