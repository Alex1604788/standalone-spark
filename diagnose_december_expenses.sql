-- =====================================================
-- ДИАГНОСТИКА: Проверка расходов за декабрь
-- =====================================================

-- ШАГ 1: Проверяем общую сумму за пол декабря (01-14)
SELECT
  'За период 01-14 декабря 2025' as period,
  COUNT(*) as total_rows,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  COUNT(DISTINCT sku) as unique_skus,
  SUM(money_spent) as total_money_spent
FROM ozon_performance_summary
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-14';

-- ШАГ 2: Проверяем общую сумму за весь декабрь (01-31)
SELECT
  'За период 01-31 декабря 2025' as period,
  COUNT(*) as total_rows,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  COUNT(DISTINCT sku) as unique_skus,
  SUM(money_spent) as total_money_spent
FROM ozon_performance_summary
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-31';

-- ШАГ 3: Проверяем расходы по кампаниям (группировка по campaign_id + stat_date)
-- Это покажет РЕАЛЬНЫЕ расходы кампаний без дублирования по SKU
SELECT
  'Расходы по кампаниям 01-14 дек (без дублирования SKU)' as analysis,
  campaign_id,
  campaign_name,
  COUNT(DISTINCT stat_date) as days_count,
  COUNT(DISTINCT sku) as skus_count,
  COUNT(*) as total_rows,
  SUM(money_spent) as total_spent_WRONG,
  -- ПРАВИЛЬНЫЙ расчет: группируем сначала по (campaign_id, stat_date), потом суммируем
  (
    SELECT SUM(daily_spent)
    FROM (
      SELECT stat_date, MAX(money_spent) as daily_spent
      FROM ozon_performance_summary s2
      WHERE s2.campaign_id = s1.campaign_id
        AND s2.stat_date >= '2025-12-01'
        AND s2.stat_date <= '2025-12-14'
      GROUP BY campaign_id, stat_date
    ) daily_totals
  ) as total_spent_CORRECT
FROM ozon_performance_summary s1
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-14'
GROUP BY campaign_id, campaign_name
ORDER BY total_spent_WRONG DESC;

-- ШАГ 4: То же для всего декабря
SELECT
  'Расходы по кампаниям 01-31 дек (без дублирования SKU)' as analysis,
  campaign_id,
  campaign_name,
  COUNT(DISTINCT stat_date) as days_count,
  COUNT(DISTINCT sku) as skus_count,
  COUNT(*) as total_rows,
  SUM(money_spent) as total_spent_WRONG,
  -- ПРАВИЛЬНЫЙ расчет: группируем сначала по (campaign_id, stat_date), потом суммируем
  (
    SELECT SUM(daily_spent)
    FROM (
      SELECT stat_date, MAX(money_spent) as daily_spent
      FROM ozon_performance_summary s2
      WHERE s2.campaign_id = s1.campaign_id
        AND s2.stat_date >= '2025-12-01'
        AND s2.stat_date <= '2025-12-31'
      GROUP BY campaign_id, stat_date
    ) daily_totals
  ) as total_spent_CORRECT
FROM ozon_performance_summary s1
WHERE stat_date >= '2025-12-01' AND stat_date <= '2025-12-31'
GROUP BY campaign_id, campaign_name
ORDER BY total_spent_WRONG DESC;

-- ШАГ 5: Проверяем структуру данных для одной кампании
-- Это покажет, как хранятся money_spent для разных SKU
SELECT
  'Пример данных для кампании (первые 20 записей)' as info,
  stat_date,
  campaign_id,
  campaign_name,
  sku,
  money_spent,
  views,
  clicks,
  total_orders
FROM ozon_performance_summary
WHERE campaign_id IS NOT NULL
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-14'
ORDER BY campaign_id, stat_date, sku
LIMIT 20;

-- ШАГ 6: Проверяем уникальность money_spent по дням для одной кампании
SELECT
  'Проверка дублирования money_spent' as check_type,
  campaign_id,
  campaign_name,
  stat_date,
  COUNT(DISTINCT sku) as sku_count,
  COUNT(*) as row_count,
  COUNT(DISTINCT money_spent) as unique_money_spent_values,
  MIN(money_spent) as min_spent,
  MAX(money_spent) as max_spent,
  SUM(money_spent) as sum_spent_WRONG,
  AVG(money_spent) as avg_spent
FROM ozon_performance_summary
WHERE campaign_id IS NOT NULL
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-14'
GROUP BY campaign_id, campaign_name, stat_date
HAVING COUNT(*) > 1  -- только дни где есть несколько записей
ORDER BY campaign_id, stat_date
LIMIT 50;
