-- Проверка: какие SKU были обработаны и какие имеют orders_model > 0
SELECT
    sku,
    COUNT(DISTINCT stat_date) as days_count,
    SUM(orders) as total_orders,
    SUM(orders_model) as total_orders_model,
    MIN(stat_date) as first_date,
    MAX(stat_date) as last_date,
    STRING_AGG(DISTINCT campaign_name, ', ') as campaigns
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND orders_model > 0
GROUP BY sku
ORDER BY total_orders_model DESC;
