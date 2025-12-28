-- Проверяем какие кампании есть в базе и когда последнее обновление
SELECT
  campaign_name,
  campaign_id,
  COUNT(*) as total_records,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date,
  MAX(created_at) as last_insert_time
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY campaign_name, campaign_id
ORDER BY last_insert_time DESC;
