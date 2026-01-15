-- =====================================================
-- ДИАГНОСТИКА: Проверка суммирования расходов
-- =====================================================

-- ШАГ 1: Проверяем сумму расходов за период 01-14 декабря
SELECT
  'Период 01-14 декабря' as period,
  COUNT(*) as total_rows,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  SUM(money_spent) as total_money_spent,
  MIN(stat_date) as min_date,
  MAX(stat_date) as max_date
FROM ozon_performance_daily
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-14';

-- ШАГ 2: Проверяем сумму расходов за весь декабрь
SELECT
  'Период 01-31 декабря' as period,
  COUNT(*) as total_rows,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  SUM(money_spent) as total_money_spent,
  MIN(stat_date) as min_date,
  MAX(stat_date) as max_date
FROM ozon_performance_daily
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-31';

-- ШАГ 3: Проверяем данные через VIEW за период 01-14 декабря
SELECT
  'VIEW: Период 01-14 декабря' as period,
  COUNT(*) as total_rows,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  SUM(money_spent) as total_money_spent,
  MIN(stat_date) as min_date,
  MAX(stat_date) as max_date
FROM ozon_performance_summary
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-14';

-- ШАГ 4: Проверяем данные через VIEW за весь декабрь
SELECT
  'VIEW: Период 01-31 декабря' as period,
  COUNT(*) as total_rows,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  SUM(money_spent) as total_money_spent,
  MIN(stat_date) as min_date,
  MAX(stat_date) as max_date
FROM ozon_performance_summary
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-31';

-- ШАГ 5: Группировка по кампаниям за период 01-14 декабря
SELECT
  'По кампаниям 01-14 дек' as analysis,
  campaign_id,
  campaign_name,
  COUNT(*) as rows,
  SUM(money_spent) as total_spent
FROM ozon_performance_daily
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-14'
GROUP BY campaign_id, campaign_name
ORDER BY total_spent DESC;

-- ШАГ 6: Группировка по кампаниям за весь декабрь
SELECT
  'По кампаниям 01-31 дек' as analysis,
  campaign_id,
  campaign_name,
  COUNT(*) as rows,
  SUM(money_spent) as total_spent
FROM ozon_performance_daily
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-31'
GROUP BY campaign_id, campaign_name
ORDER BY total_spent DESC;
