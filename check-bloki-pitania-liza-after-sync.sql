-- Проверяем есть ли кампания "Блоки питания Лиза" и SKU 3107627916
SELECT
  stat_date,
  sku,
  campaign_name,
  campaign_id,
  orders,
  orders_model,
  revenue,
  created_at
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND (
    campaign_name LIKE '%Блоки питания Лиза%'
    OR campaign_id = '19627641'
    OR sku = '3107627916'
  )
ORDER BY created_at DESC, stat_date DESC
LIMIT 50;
