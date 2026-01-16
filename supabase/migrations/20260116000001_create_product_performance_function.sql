-- =====================================================
-- ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ДАННЫХ ПО ТОВАРАМ В КАМПАНИИ
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

    -- Расходы распределяются пропорционально кликам (как в оригинальном коде)
    0::DECIMAL as money_spent_placeholder,

    SUM(COALESCE(s.views, 0))::BIGINT,
    SUM(COALESCE(s.clicks, 0))::BIGINT,
    SUM(COALESCE(s.add_to_cart, 0))::BIGINT,
    SUM(COALESCE(s.favorites, 0))::BIGINT,
    SUM(COALESCE(s.total_orders, 0))::BIGINT,
    SUM(COALESCE(s.total_revenue, 0))::DECIMAL,

    -- Средние метрики
    CASE WHEN SUM(s.views) > 0
      THEN ROUND((SUM(s.clicks)::DECIMAL / SUM(s.views)) * 100, 2)
      ELSE 0
    END,  -- avg_ctr

    0::DECIMAL,  -- avg_cpc - будет вычислен позже

    CASE WHEN SUM(s.clicks) > 0
      THEN ROUND((SUM(s.add_to_cart)::DECIMAL / SUM(s.clicks)) * 100, 2)
      ELSE 0
    END,  -- avg_add_to_cart_conversion

    CASE WHEN SUM(s.clicks) > 0
      THEN ROUND((SUM(s.total_orders)::DECIMAL / SUM(s.clicks)) * 100, 2)
      ELSE 0
    END,  -- avg_conversion

    0::DECIMAL,  -- avg_drr - будет вычислен позже

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

-- Даем доступ authenticated пользователям
GRANT EXECUTE ON FUNCTION public.get_product_performance_by_campaign(UUID, TEXT, DATE, DATE) TO authenticated;

-- Комментарий для документации
COMMENT ON FUNCTION public.get_product_performance_by_campaign IS
'Получает агрегированные данные по товарам внутри конкретной рекламной кампании.

Параметры:
- p_marketplace_id: ID маркетплейса
- p_campaign_id: ID кампании (или NULL для товаров без кампании)
- p_start_date: Начальная дата периода
- p_end_date: Конечная дата периода

Примечание: total_money_spent возвращается как 0, так как расходы распределяются
пропорционально кликам на уровне приложения.';
