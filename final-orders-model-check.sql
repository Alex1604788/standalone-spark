-- Агрегированная проверка: orders_model работает или нет?
SELECT
    stat_date,
    COUNT(*) as records_count,
    COUNT(DISTINCT sku) as unique_skus,
    SUM(orders) as total_orders,
    SUM(orders_model) as total_orders_model,
    SUM(orders + COALESCE(orders_model, 0)) as total_combined,
    COUNT(CASE WHEN orders_model > 0 THEN 1 END) as records_with_models,
    ROUND(AVG(CASE WHEN orders_model > 0 THEN orders_model END), 2) as avg_orders_model
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND stat_date >= '2025-12-18'
GROUP BY stat_date
ORDER BY stat_date DESC;

-- Какие SKU имеют orders_model > 0 за последние дни
SELECT
    sku,
    COUNT(DISTINCT stat_date) as days_with_model_orders,
    SUM(orders_model) as total_model_orders,
    MIN(stat_date) as first_date,
    MAX(stat_date) as last_date
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND stat_date >= '2025-12-18'
  AND orders_model > 0
GROUP BY sku
ORDER BY total_model_orders DESC;

-- Проверка конкретно SKU 3107627916
SELECT
    stat_date,
    campaign_name,
    orders,
    orders_model,
    revenue,
    imported_at
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND sku = '3107627916'
  AND stat_date >= '2025-12-18'
ORDER BY stat_date DESC, campaign_name;
