-- =====================================================
-- ПРИМЕНИТЬ ЭТИ МИГРАЦИИ В SUPABASE DASHBOARD
-- =====================================================
-- Инструкция:
-- 1. Откройте https://supabase.com/dashboard/project/bkmicyguzlwampuindff
-- 2. Перейдите в SQL Editor (левое меню)
-- 3. Создайте New Query
-- 4. Скопируйте ВСЁ содержимое этого файла
-- 5. Вставьте в редактор
-- 6. Нажмите RUN (или Ctrl+Enter)
-- 7. Дождитесь "Success. No rows returned"
-- =====================================================

-- МИГРАЦИЯ 1: Функция агрегации кампаний
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_campaign_performance_aggregated(
  p_marketplace_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  campaign_id TEXT,
  campaign_name TEXT,
  campaign_type TEXT,
  total_money_spent DECIMAL,
  days_with_expenses INTEGER,
  total_views BIGINT,
  total_clicks BIGINT,
  total_add_to_cart BIGINT,
  total_favorites BIGINT,
  total_orders BIGINT,
  total_revenue DECIMAL,
  avg_ctr DECIMAL,
  avg_cpc DECIMAL,
  avg_add_to_cart_conversion DECIMAL,
  avg_conversion DECIMAL,
  avg_drr DECIMAL,
  min_date DATE,
  max_date DATE,
  sku_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH
  campaign_daily_expenses AS (
    SELECT
      COALESCE(campaign_id, '__NO_CAMPAIGN__') as camp_id,
      stat_date,
      MAX(money_spent) as daily_money_spent
    FROM public.ozon_performance_summary
    WHERE marketplace_id = p_marketplace_id
      AND stat_date >= p_start_date
      AND stat_date <= p_end_date
    GROUP BY COALESCE(campaign_id, '__NO_CAMPAIGN__'), stat_date
  ),
  campaign_expenses AS (
    SELECT
      camp_id,
      SUM(daily_money_spent) as total_spent,
      COUNT(DISTINCT stat_date) as days_count
    FROM campaign_daily_expenses
    GROUP BY camp_id
  ),
  campaign_metrics AS (
    SELECT
      COALESCE(s.campaign_id, '__NO_CAMPAIGN__') as camp_id,
      MAX(CASE WHEN s.campaign_id IS NULL THEN 'Без кампании' ELSE s.campaign_name END) as camp_name,
      MAX(s.campaign_type) as camp_type,
      SUM(COALESCE(s.views, 0)) as sum_views,
      SUM(COALESCE(s.clicks, 0)) as sum_clicks,
      SUM(COALESCE(s.add_to_cart, 0)) as sum_add_to_cart,
      SUM(COALESCE(s.favorites, 0)) as sum_favorites,
      SUM(COALESCE(s.total_orders, 0)) as sum_orders,
      SUM(COALESCE(s.total_revenue, 0)) as sum_revenue,
      MIN(s.stat_date) as min_stat_date,
      MAX(s.stat_date) as max_stat_date,
      COUNT(DISTINCT s.sku) as unique_skus
    FROM public.ozon_performance_summary s
    WHERE s.marketplace_id = p_marketplace_id
      AND s.stat_date >= p_start_date
      AND s.stat_date <= p_end_date
    GROUP BY COALESCE(s.campaign_id, '__NO_CAMPAIGN__')
  )
  SELECT
    CASE WHEN m.camp_id = '__NO_CAMPAIGN__' THEN NULL ELSE m.camp_id END,
    m.camp_name,
    m.camp_type,
    COALESCE(e.total_spent, 0),
    COALESCE(e.days_count, 0),
    m.sum_views,
    m.sum_clicks,
    m.sum_add_to_cart,
    m.sum_favorites,
    m.sum_orders,
    m.sum_revenue,
    CASE WHEN m.sum_views > 0
      THEN ROUND((m.sum_clicks::DECIMAL / m.sum_views) * 100, 2)
      ELSE 0
    END,
    CASE WHEN m.sum_clicks > 0
      THEN ROUND(COALESCE(e.total_spent, 0) / m.sum_clicks, 2)
      ELSE 0
    END,
    CASE WHEN m.sum_clicks > 0
      THEN ROUND((m.sum_add_to_cart::DECIMAL / m.sum_clicks) * 100, 2)
      ELSE 0
    END,
    CASE WHEN m.sum_clicks > 0
      THEN ROUND((m.sum_orders::DECIMAL / m.sum_clicks) * 100, 2)
      ELSE 0
    END,
    CASE WHEN m.sum_revenue > 0
      THEN ROUND((COALESCE(e.total_spent, 0) / m.sum_revenue) * 100, 2)
      ELSE NULL
    END,
    m.min_stat_date,
    m.max_stat_date,
    m.unique_skus
  FROM campaign_metrics m
  LEFT JOIN campaign_expenses e ON m.camp_id = e.camp_id
  ORDER BY COALESCE(e.total_spent, 0) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_campaign_performance_aggregated(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_campaign_performance_aggregated IS
'Получает агрегированные данные по рекламным кампаниям с правильной дедупликацией расходов.
Решает проблему лимита в 1000 записей путем агрегации данных на уровне БД.';

-- МИГРАЦИЯ 2: Функция по товарам
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_product_performance_by_campaign(
  p_marketplace_id UUID,
  p_campaign_id TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  sku TEXT,
  offer_id TEXT,
  total_money_spent DECIMAL,
  total_views BIGINT,
  total_clicks BIGINT,
  total_add_to_cart BIGINT,
  total_favorites BIGINT,
  total_orders BIGINT,
  total_revenue DECIMAL,
  avg_ctr DECIMAL,
  avg_cpc DECIMAL,
  avg_add_to_cart_conversion DECIMAL,
  avg_conversion DECIMAL,
  avg_drr DECIMAL,
  min_date DATE,
  max_date DATE,
  days_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.sku,
    MAX(s.offer_id) as offer_id,
    0::DECIMAL as money_spent_placeholder,
    SUM(COALESCE(s.views, 0))::BIGINT,
    SUM(COALESCE(s.clicks, 0))::BIGINT,
    SUM(COALESCE(s.add_to_cart, 0))::BIGINT,
    SUM(COALESCE(s.favorites, 0))::BIGINT,
    SUM(COALESCE(s.total_orders, 0))::BIGINT,
    SUM(COALESCE(s.total_revenue, 0))::DECIMAL,
    CASE WHEN SUM(s.views) > 0
      THEN ROUND((SUM(s.clicks)::DECIMAL / SUM(s.views)) * 100, 2)
      ELSE 0
    END,
    0::DECIMAL,
    CASE WHEN SUM(s.clicks) > 0
      THEN ROUND((SUM(s.add_to_cart)::DECIMAL / SUM(s.clicks)) * 100, 2)
      ELSE 0
    END,
    CASE WHEN SUM(s.clicks) > 0
      THEN ROUND((SUM(s.total_orders)::DECIMAL / SUM(s.clicks)) * 100, 2)
      ELSE 0
    END,
    0::DECIMAL,
    MIN(s.stat_date),
    MAX(s.stat_date),
    COUNT(DISTINCT s.stat_date)::INTEGER
  FROM public.ozon_performance_summary s
  WHERE s.marketplace_id = p_marketplace_id
    AND COALESCE(s.campaign_id, '__NO_CAMPAIGN__') = COALESCE(p_campaign_id, '__NO_CAMPAIGN__')
    AND s.stat_date >= p_start_date
    AND s.stat_date <= p_end_date
    AND s.sku IS NOT NULL
    AND s.sku != ''
  GROUP BY s.sku;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_product_performance_by_campaign(UUID, TEXT, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_product_performance_by_campaign IS
'Получает агрегированные данные по товарам внутри конкретной рекламной кампании.';

-- =====================================================
-- ГОТОВО! Теперь проверьте, что функции созданы:
-- =====================================================

SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_campaign_performance_aggregated',
    'get_product_performance_by_campaign'
  );

-- Должно вернуть 2 строки ✅
