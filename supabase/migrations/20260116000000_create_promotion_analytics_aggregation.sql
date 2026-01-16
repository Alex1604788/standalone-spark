-- =====================================================
-- ФУНКЦИЯ ДЛЯ АГРЕГАЦИИ ДАННЫХ АНАЛИТИКИ ПРОДВИЖЕНИЯ
-- =====================================================
-- Эта функция решает проблему, когда данные не суммируются
-- правильно при выборе больших периодов из-за лимита Supabase (1000 строк)
--
-- Проблема:
-- - При выборе недели: 7 дней * 10 SKU = 70 строк → всё работает
-- - При выборе месяца: 30 дней * 10 SKU = 300 строк → всё работает
-- - При выборе 3 месяцев: 90 дней * 10 SKU = 900 строк → может не хватить
--
-- Решение: Агрегация на уровне SQL вместо JavaScript
-- =====================================================

-- Удаляем старую функцию если существует
DROP FUNCTION IF EXISTS get_promotion_analytics_aggregated(UUID, DATE, DATE);

-- Создаем функцию для агрегации данных по кампаниям
CREATE OR REPLACE FUNCTION get_promotion_analytics_aggregated(
  p_marketplace_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  campaign_id TEXT,
  campaign_name TEXT,
  campaign_type TEXT,
  sku TEXT,
  offer_id TEXT,

  -- Агрегированные метрики
  product_money_spent NUMERIC,  -- Расходы на уровне товара (будут рассчитаны в JS)
  campaign_total_money_spent NUMERIC,  -- Общие расходы кампании
  total_views BIGINT,
  total_clicks BIGINT,
  total_add_to_cart BIGINT,
  total_favorites BIGINT,
  total_orders NUMERIC,
  total_revenue NUMERIC,

  -- Даты
  min_date DATE,
  max_date DATE,
  days_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- ШАГ 1: Дедупликация money_spent по (campaign_id, stat_date)
  -- Проблема: в OZON Performance API money_spent указывается на уровне кампании,
  -- но если кампания продвигала N товаров в один день, то будет N записей с одинаковым money_spent
  daily_expenses AS (
    SELECT
      COALESCE(campaign_id, '__NO_CAMPAIGN__') as campaign_id,
      stat_date,
      MAX(money_spent) as daily_money_spent  -- берем MAX на случай дублей (они должны быть одинаковые)
    FROM ozon_performance_summary
    WHERE marketplace_id = p_marketplace_id
      AND stat_date >= p_start_date
      AND stat_date <= p_end_date
    GROUP BY COALESCE(campaign_id, '__NO_CAMPAIGN__'), stat_date
  ),

  -- ШАГ 2: Суммируем дедуплицированные расходы по кампаниям
  campaign_expenses AS (
    SELECT
      campaign_id,
      SUM(daily_money_spent) as total_money_spent
    FROM daily_expenses
    GROUP BY campaign_id
  ),

  -- ШАГ 3: Агрегируем остальные метрики по кампаниям и товарам
  aggregated_data AS (
    SELECT
      COALESCE(ops.campaign_id, '__NO_CAMPAIGN__') as campaign_id,
      MAX(ops.campaign_name) as campaign_name,  -- берем любое непустое значение
      MAX(ops.campaign_type) as campaign_type,
      ops.sku,
      MAX(ops.offer_id) as offer_id,

      -- Суммы метрик (БЕЗ money_spent - его возьмем из campaign_expenses)
      SUM(ops.views) as total_views,
      SUM(ops.clicks) as total_clicks,
      SUM(ops.add_to_cart) as total_add_to_cart,
      SUM(ops.favorites) as total_favorites,
      SUM(ops.total_orders) as total_orders,  -- уже сумма orders + orders_model из VIEW
      SUM(ops.total_revenue) as total_revenue, -- уже сумма revenue + revenue_model из VIEW

      -- Диапазон дат
      MIN(ops.stat_date) as min_date,
      MAX(ops.stat_date) as max_date,
      COUNT(DISTINCT ops.stat_date) as days_count
    FROM ozon_performance_summary ops
    WHERE ops.marketplace_id = p_marketplace_id
      AND ops.stat_date >= p_start_date
      AND ops.stat_date <= p_end_date
      AND ops.sku IS NOT NULL
      AND ops.sku != ''
    GROUP BY COALESCE(ops.campaign_id, '__NO_CAMPAIGN__'), ops.sku
  )

  -- ШАГ 4: Объединяем данные с правильными расходами
  -- ВАЖНО: Расходы на уровне товаров нужно распределять пропорционально кликам
  -- Это делается в фронтенд коде, здесь возвращаем общие расходы кампании
  SELECT
    ad.campaign_id::TEXT,
    COALESCE(
      ad.campaign_name,
      CASE WHEN ad.campaign_id = '__NO_CAMPAIGN__' THEN 'Без кампании'
           ELSE 'Кампания ' || ad.campaign_id
      END
    )::TEXT as campaign_name,
    ad.campaign_type::TEXT,
    ad.sku::TEXT,
    ad.offer_id::TEXT,

    -- Расходы на уровне товара (пока 0, будут рассчитаны в JS)
    0::NUMERIC as product_money_spent,
    -- Общие расходы кампании (дедуплицированные)
    COALESCE(ce.total_money_spent, 0) as campaign_total_money_spent,

    -- Остальные метрики как есть
    ad.total_views,
    ad.total_clicks,
    ad.total_add_to_cart,
    ad.total_favorites,
    ad.total_orders,
    ad.total_revenue,

    ad.min_date,
    ad.max_date,
    ad.days_count::INTEGER
  FROM aggregated_data ad
  LEFT JOIN campaign_expenses ce ON ce.campaign_id = ad.campaign_id
  ORDER BY ce.total_money_spent DESC NULLS LAST, ad.campaign_id, ad.sku;

END;
$$;

-- Даем права на выполнение функции
GRANT EXECUTE ON FUNCTION get_promotion_analytics_aggregated(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_promotion_analytics_aggregated(UUID, DATE, DATE) TO anon;

-- Создаем комментарий для документации
COMMENT ON FUNCTION get_promotion_analytics_aggregated IS
'Возвращает агрегированные данные по продвижению для указанного marketplace и периода.
Решает проблему лимита в 1000 строк Supabase, делая агрегацию на уровне SQL.
Правильно дедуплицирует money_spent по (campaign_id, stat_date),
чтобы избежать завышения расходов при наличии нескольких товаров в одной кампании.';

-- =====================================================
-- ДОПОЛНИТЕЛЬНАЯ ФУНКЦИЯ: Агрегация на уровне кампаний (без товаров)
-- Для быстрого получения общей статистики по кампаниям
-- =====================================================

DROP FUNCTION IF EXISTS get_campaigns_summary(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_campaigns_summary(
  p_marketplace_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  campaign_id TEXT,
  campaign_name TEXT,
  campaign_type TEXT,
  sku_count INTEGER,

  total_money_spent NUMERIC,
  total_views BIGINT,
  total_clicks BIGINT,
  total_add_to_cart BIGINT,
  total_favorites BIGINT,
  total_orders NUMERIC,
  total_revenue NUMERIC,

  min_date DATE,
  max_date DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH
  daily_expenses AS (
    SELECT
      COALESCE(campaign_id, '__NO_CAMPAIGN__') as campaign_id,
      stat_date,
      MAX(money_spent) as daily_money_spent
    FROM ozon_performance_summary
    WHERE marketplace_id = p_marketplace_id
      AND stat_date >= p_start_date
      AND stat_date <= p_end_date
    GROUP BY COALESCE(campaign_id, '__NO_CAMPAIGN__'), stat_date
  ),

  campaign_expenses AS (
    SELECT
      campaign_id,
      SUM(daily_money_spent) as total_money_spent
    FROM daily_expenses
    GROUP BY campaign_id
  )

  SELECT
    COALESCE(ops.campaign_id, '__NO_CAMPAIGN__')::TEXT,
    COALESCE(
      MAX(ops.campaign_name),
      CASE WHEN COALESCE(ops.campaign_id, '__NO_CAMPAIGN__') = '__NO_CAMPAIGN__'
           THEN 'Без кампании'
           ELSE 'Кампания ' || COALESCE(ops.campaign_id, '__NO_CAMPAIGN__')
      END
    )::TEXT as campaign_name,
    MAX(ops.campaign_type)::TEXT as campaign_type,
    COUNT(DISTINCT ops.sku)::INTEGER as sku_count,

    COALESCE(ce.total_money_spent, 0) as total_money_spent,
    SUM(ops.views)::BIGINT as total_views,
    SUM(ops.clicks)::BIGINT as total_clicks,
    SUM(ops.add_to_cart)::BIGINT as total_add_to_cart,
    SUM(ops.favorites)::BIGINT as total_favorites,
    SUM(ops.total_orders) as total_orders,
    SUM(ops.total_revenue) as total_revenue,

    MIN(ops.stat_date) as min_date,
    MAX(ops.stat_date) as max_date
  FROM ozon_performance_summary ops
  LEFT JOIN campaign_expenses ce ON ce.campaign_id = COALESCE(ops.campaign_id, '__NO_CAMPAIGN__')
  WHERE ops.marketplace_id = p_marketplace_id
    AND ops.stat_date >= p_start_date
    AND ops.stat_date <= p_end_date
  GROUP BY COALESCE(ops.campaign_id, '__NO_CAMPAIGN__'), ce.total_money_spent
  ORDER BY ce.total_money_spent DESC NULLS LAST;

END;
$$;

GRANT EXECUTE ON FUNCTION get_campaigns_summary(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaigns_summary(UUID, DATE, DATE) TO anon;

COMMENT ON FUNCTION get_campaigns_summary IS
'Возвращает сводку по кампаниям без разбивки по товарам.
Быстрее чем get_promotion_analytics_aggregated, используйте для общей статистики.';
