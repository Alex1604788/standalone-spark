-- =====================================================
-- SQL ЗАПРОСЫ ДЛЯ ДИАГНОСТИКИ ПРОБЛЕМЫ С РАСХОДАМИ
-- Кампания: Кабель КГ 2*2,5 (ID: 11033377)
-- =====================================================

-- ЗАПРОС 1: Проверка количества записей по дням
-- Должно быть: 1 запись на день для кампании без товаров, или N записей (по числу товаров) с одинаковым money_spent
SELECT
  stat_date,
  campaign_id,
  campaign_name,
  COUNT(*) as records_count,
  COUNT(DISTINCT sku) as unique_skus,
  MAX(money_spent) as money_spent_value,
  -- Проверяем, что все money_spent одинаковые для одного дня
  MIN(money_spent) = MAX(money_spent) as same_money_spent
FROM ozon_performance_daily
WHERE campaign_name = 'Кабель КГ 2*2,5'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31'
GROUP BY stat_date, campaign_id, campaign_name
ORDER BY stat_date ASC;

-- =====================================================
-- ЗАПРОС 2: Сумма расходов за весь месяц (правильная дедупликация)
-- =====================================================
SELECT
  campaign_name,
  COUNT(DISTINCT stat_date) as days_count,
  -- Правильная сумма: берем УНИКАЛЬНЫЕ значения money_spent по дням
  SUM(daily_expense) as total_expenses_correct
FROM (
  SELECT
    campaign_name,
    stat_date,
    MAX(money_spent) as daily_expense  -- MAX или MIN - должны быть одинаковые для одного дня
  FROM ozon_performance_daily
  WHERE campaign_name = 'Кабель КГ 2*2,5'
    AND stat_date >= '2025-12-01'
    AND stat_date <= '2025-12-31'
  GROUP BY campaign_name, stat_date
) as daily_unique
GROUP BY campaign_name;

-- =====================================================
-- ЗАПРОС 3: Сравнение с неправильной суммой (без дедупликации)
-- =====================================================
SELECT
  campaign_name,
  -- НЕПРАВИЛЬНО: просто суммируем все записи (будет дублирование)
  SUM(money_spent) as total_wrong,
  -- ПРАВИЛЬНО: сначала группируем по дням
  (
    SELECT SUM(daily_expense)
    FROM (
      SELECT stat_date, MAX(money_spent) as daily_expense
      FROM ozon_performance_daily
      WHERE campaign_name = 'Кабель КГ 2*2,5'
        AND stat_date >= '2025-12-01'
        AND stat_date <= '2025-12-31'
      GROUP BY stat_date
    ) as daily
  ) as total_correct
FROM ozon_performance_daily
WHERE campaign_name = 'Кабель КГ 2*2,5'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31'
GROUP BY campaign_name;

-- =====================================================
-- ЗАПРОС 4: Проверка за неделю (1-7 декабря)
-- Должно быть: 24 428 рублей
-- =====================================================
SELECT
  'За неделю (1-7 дек)' as period,
  SUM(daily_expense) as total_expenses
FROM (
  SELECT
    stat_date,
    MAX(money_spent) as daily_expense
  FROM ozon_performance_daily
  WHERE campaign_name = 'Кабель КГ 2*2,5'
    AND stat_date >= '2025-12-01'
    AND stat_date <= '2025-12-07'
  GROUP BY stat_date
) as daily_unique;

-- =====================================================
-- ЗАПРОС 5: Проверка за месяц (1-31 декабря)
-- Должно быть: 109 129,99 рублей (по данным OZON)
-- =====================================================
SELECT
  'За месяц (1-31 дек)' as period,
  SUM(daily_expense) as total_expenses
FROM (
  SELECT
    stat_date,
    MAX(money_spent) as daily_expense
  FROM ozon_performance_daily
  WHERE campaign_name = 'Кабель КГ 2*2,5'
    AND stat_date >= '2025-12-01'
    AND stat_date <= '2025-12-31'
  GROUP BY stat_date
) as daily_unique;

-- =====================================================
-- ЗАПРОС 6: Список всех дат с расходами
-- Чтобы понять, за какие дни есть данные
-- =====================================================
SELECT
  stat_date,
  MAX(money_spent) as money_spent,
  COUNT(*) as records,
  COUNT(DISTINCT sku) as skus
FROM ozon_performance_daily
WHERE campaign_name = 'Кабель КГ 2*2,5'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31'
GROUP BY stat_date
ORDER BY stat_date ASC;

-- =====================================================
-- ЗАПРОС 7: Проверка наличия данных orders_model и revenue_model
-- Возможно, часть данных загружена без model полей
-- =====================================================
SELECT
  COUNT(*) as total_records,
  COUNT(CASE WHEN orders_model IS NOT NULL AND orders_model > 0 THEN 1 END) as has_orders_model,
  COUNT(CASE WHEN revenue_model IS NOT NULL AND revenue_model > 0 THEN 1 END) as has_revenue_model,
  SUM(orders) as total_orders,
  SUM(orders_model) as total_orders_model,
  SUM(revenue) as total_revenue,
  SUM(revenue_model) as total_revenue_model
FROM ozon_performance_daily
WHERE campaign_name = 'Кабель КГ 2*2,5'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31';
