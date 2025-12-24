-- Проверка 1: Какие даты появились в БД после синхронизации
SELECT 
    stat_date,
    COUNT(*) as records_count,
    COUNT(DISTINCT sku) as unique_skus,
    SUM(orders) as total_orders,
    SUM(orders_model) as total_orders_model,
    COUNT(CASE WHEN orders_model > 0 THEN 1 END) as records_with_models,
    MAX(imported_at) as last_import_time
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY stat_date
ORDER BY stat_date DESC;

-- Проверка 2: SKU 3107627916 - есть ли данные?
SELECT
    stat_date,
    campaign_name,
    orders,
    orders_model,
    revenue,
    money_spent,
    clicks,
    views,
    imported_at
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND sku = '3107627916'
ORDER BY stat_date DESC, campaign_name;
