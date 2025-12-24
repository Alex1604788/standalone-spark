-- Проверка данных за последние дни (23-24 декабря 2025)
SELECT
    stat_date,
    sku,
    campaign_name,
    orders,
    orders_model,
    revenue,
    imported_at
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND stat_date >= '2025-12-23'
ORDER BY stat_date DESC, sku, campaign_name;

-- Агрегированные данные по SKU
SELECT
    sku,
    SUM(orders) as total_orders,
    SUM(orders_model) as total_orders_model,
    SUM(orders + COALESCE(orders_model, 0)) as total_all,
    SUM(revenue) as total_revenue,
    COUNT(DISTINCT campaign_name) as campaigns_count
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND stat_date >= '2025-12-23'
GROUP BY sku
ORDER BY total_all DESC;
