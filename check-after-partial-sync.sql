-- Какие кампании были синхронизированы
SELECT DISTINCT campaign_name, COUNT(*) as records
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY campaign_name
ORDER BY campaign_name;

-- Есть ли SKU 3107627916?
SELECT stat_date, campaign_name, orders, orders_model, revenue
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND sku = '3107627916'
ORDER BY stat_date DESC;
