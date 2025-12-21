-- =====================================================
-- Проверка данных в таблице ozon_performance_daily
-- =====================================================

-- 1. Общая статистика по таблице
SELECT 
  COUNT(*) as total_records,
  COUNT(DISTINCT marketplace_id) as unique_marketplaces,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  COUNT(DISTINCT sku) as unique_skus,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date,
  SUM(money_spent) as total_money_spent,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders) as total_orders,
  SUM(revenue) as total_revenue
FROM ozon_performance_daily;

-- 2. Статистика по marketplace_id
SELECT 
  marketplace_id,
  COUNT(*) as records_count,
  COUNT(DISTINCT campaign_id) as campaigns_count,
  COUNT(DISTINCT sku) as skus_count,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date,
  SUM(money_spent) as total_money_spent
FROM ozon_performance_daily
GROUP BY marketplace_id
ORDER BY records_count DESC;

-- 3. Примеры записей (последние 10)
SELECT 
  id,
  marketplace_id,
  stat_date,
  sku,
  offer_id,
  campaign_id,
  campaign_name,
  campaign_type,
  money_spent,
  views,
  clicks,
  orders,
  revenue
FROM ozon_performance_daily
ORDER BY stat_date DESC, imported_at DESC
LIMIT 10;

-- 4. Распределение по датам (последние 30 дней)
SELECT 
  stat_date,
  COUNT(*) as records_count,
  COUNT(DISTINCT campaign_id) as campaigns_count,
  COUNT(DISTINCT sku) as skus_count,
  SUM(money_spent) as total_money_spent,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders) as total_orders
FROM ozon_performance_daily
WHERE stat_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY stat_date
ORDER BY stat_date DESC;

-- 5. Топ кампаний по расходам
SELECT 
  campaign_id,
  campaign_name,
  campaign_type,
  COUNT(DISTINCT sku) as skus_count,
  COUNT(*) as records_count,
  MIN(stat_date) as first_date,
  MAX(stat_date) as last_date,
  SUM(money_spent) as total_money_spent,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders) as total_orders,
  SUM(revenue) as total_revenue
FROM ozon_performance_daily
GROUP BY campaign_id, campaign_name, campaign_type
ORDER BY total_money_spent DESC
LIMIT 20;

-- 6. Проверка связи с таблицей products
SELECT 
  opd.sku,
  opd.offer_id,
  COUNT(*) as records_count,
  COUNT(DISTINCT opd.campaign_id) as campaigns_count,
  p.name as product_name,
  p.id as product_id
FROM ozon_performance_daily opd
LEFT JOIN products p ON p.sku = opd.sku AND p.marketplace_id = opd.marketplace_id
GROUP BY opd.sku, opd.offer_id, p.name, p.id
ORDER BY records_count DESC
LIMIT 20;

-- 7. Проверка RLS политик (для текущего пользователя)
-- Замените YOUR_USER_ID на ваш user_id из auth.users
SELECT 
  m.id as marketplace_id,
  m.user_id,
  COUNT(opd.id) as records_count
FROM marketplaces m
LEFT JOIN ozon_performance_daily opd ON opd.marketplace_id = m.id
GROUP BY m.id, m.user_id
ORDER BY records_count DESC;

-- 8. Проверка данных за конкретный период (пример: декабрь 2025)
SELECT 
  COUNT(*) as records_count,
  COUNT(DISTINCT campaign_id) as campaigns_count,
  COUNT(DISTINCT sku) as skus_count,
  SUM(money_spent) as total_money_spent
FROM ozon_performance_daily
WHERE stat_date >= '2025-12-01' 
  AND stat_date <= '2025-12-31';

-- 9. Проверка NULL значений
SELECT 
  COUNT(*) FILTER (WHERE campaign_id IS NULL OR campaign_id = '') as null_campaign_id,
  COUNT(*) FILTER (WHERE campaign_name IS NULL) as null_campaign_name,
  COUNT(*) FILTER (WHERE sku IS NULL OR sku = '') as null_sku,
  COUNT(*) FILTER (WHERE offer_id IS NULL) as null_offer_id,
  COUNT(*) FILTER (WHERE money_spent IS NULL) as null_money_spent
FROM ozon_performance_daily;

-- 10. Проверка для конкретного marketplace (замените MARKETPLACE_ID)
-- SELECT 
--   COUNT(*) as records_count,
--   MIN(stat_date) as earliest_date,
--   MAX(stat_date) as latest_date,
--   COUNT(DISTINCT campaign_id) as campaigns_count,
--   COUNT(DISTINCT sku) as skus_count
-- FROM ozon_performance_daily
-- WHERE marketplace_id = 'MARKETPLACE_ID';

