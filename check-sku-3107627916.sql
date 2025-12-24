-- Полная проверка SKU 3107627916 за период 8-23.12.2025
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
  AND stat_date >= '2025-12-08'
  AND stat_date <= '2025-12-23'
ORDER BY stat_date ASC, campaign_name;
