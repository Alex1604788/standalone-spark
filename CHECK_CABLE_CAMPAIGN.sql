-- Проверка данных для кампании "Кабель КГ 2*2,5"

-- 1. Сколько уникальных campaign_id для этой кампании?
SELECT
  campaign_id,
  campaign_name,
  COUNT(DISTINCT stat_date) as days_count,
  COUNT(*) as total_records,
  SUM(DISTINCT money_spent) as wrong_sum,  -- НЕПРАВИЛЬНО!
  MIN(stat_date) as min_date,
  MAX(stat_date) as max_date
FROM ozon_performance_summary
WHERE campaign_name LIKE '%Кабель КГ 2%2,5%'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31'
GROUP BY campaign_id, campaign_name
ORDER BY campaign_id;

-- 2. Правильная дедупликация расходов по дням
WITH daily_expenses AS (
  SELECT
    campaign_id,
    campaign_name,
    stat_date,
    MAX(money_spent) as daily_money_spent  -- берем MAX на случай дублей
  FROM ozon_performance_summary
  WHERE campaign_name LIKE '%Кабель КГ 2%2,5%'
    AND stat_date >= '2025-12-01'
    AND stat_date <= '2025-12-31'
  GROUP BY campaign_id, campaign_name, stat_date
)
SELECT
  campaign_id,
  campaign_name,
  COUNT(DISTINCT stat_date) as days_count,
  SUM(daily_money_spent) as correct_total_spent,
  MIN(stat_date) as min_date,
  MAX(stat_date) as max_date
FROM daily_expenses
GROUP BY campaign_id, campaign_name
ORDER BY correct_total_spent DESC;

-- 3. Проверка - сколько товаров (SKU) в кампании?
SELECT
  campaign_id,
  campaign_name,
  COUNT(DISTINCT sku) as unique_skus,
  COUNT(DISTINCT stat_date) as unique_dates,
  COUNT(*) as total_records
FROM ozon_performance_summary
WHERE campaign_name LIKE '%Кабель КГ 2%2,5%'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31'
GROUP BY campaign_id, campaign_name;

-- 4. Примеры дневных расходов
SELECT
  campaign_id,
  campaign_name,
  stat_date,
  COUNT(*) as records_per_day,
  MAX(money_spent) as money_spent_value,
  COUNT(DISTINCT sku) as skus_per_day
FROM ozon_performance_summary
WHERE campaign_name LIKE '%Кабель КГ 2%2,5%'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31'
GROUP BY campaign_id, campaign_name, stat_date
ORDER BY stat_date DESC
LIMIT 10;
