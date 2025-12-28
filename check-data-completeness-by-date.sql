-- Проверка полноты данных по датам
-- Показывает сколько записей и кампаний за каждую дату

SELECT
  stat_date,
  COUNT(*) as total_records,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  COUNT(DISTINCT sku) as unique_skus,
  SUM(orders) as total_orders,
  SUM(orders_model) as total_orders_model,
  SUM(revenue) as total_revenue
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY stat_date
ORDER BY stat_date ASC;
