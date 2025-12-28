-- Проверяем есть ли кампания "Блоки питания Лиза" и какие SKU в ней
SELECT DISTINCT sku, campaign_name, stat_date, orders, orders_model, revenue
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND campaign_name LIKE '%Блоки питания%'
ORDER BY stat_date DESC, sku
LIMIT 30;
