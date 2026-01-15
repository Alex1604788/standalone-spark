-- =====================================================
-- 🚀 БЫСТРАЯ ПРОВЕРКА РАСХОДОВ
-- Скопируйте и вставьте в Supabase SQL Editor
-- https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
-- =====================================================

-- ЗАПРОС 1: Сколько дней декабря есть в БД?
-- Должно быть: 31
-- =====================================================
SELECT
  'Количество дней с данными' as check_name,
  COUNT(DISTINCT stat_date) as days_count,
  CASE
    WHEN COUNT(DISTINCT stat_date) = 31 THEN '✅ ВСЕ 31 ДЕНЬ'
    ELSE '❌ ДАННЫЕ НЕПОЛНЫЕ! Отсутствует ' || (31 - COUNT(DISTINCT stat_date))::text || ' дней'
  END as status
FROM ozon_performance_daily
WHERE campaign_name = 'Кабель КГ 2*2,5'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31';

-- =====================================================
-- ЗАПРОС 2: Расходы С дедупликацией (ПРАВИЛЬНО)
-- Должно быть: ~109 130 ₽
-- =====================================================
SELECT
  'Расходы за месяц С дедупликацией' as check_name,
  ROUND(SUM(daily_expense)::numeric, 2) as total_correct,
  '~109 130' as expected,
  CASE
    WHEN ABS(SUM(daily_expense) - 109130) < 100 THEN '✅ СОВПАДАЕТ'
    WHEN ABS(SUM(daily_expense) - 109130) < 1000 THEN '⚠️ БЛИЗКО (разница < 1000)'
    ELSE '❌ НЕ СОВПАДАЕТ! Разница: ' || ROUND((SUM(daily_expense) - 109130)::numeric, 2)::text || ' ₽'
  END as status
FROM (
  SELECT stat_date, MAX(money_spent) as daily_expense
  FROM ozon_performance_daily
  WHERE campaign_name = 'Кабель КГ 2*2,5'
    AND stat_date >= '2025-12-01'
    AND stat_date <= '2025-12-31'
  GROUP BY stat_date
) as daily_unique;

-- =====================================================
-- ЗАПРОС 3: Расходы БЕЗ дедупликации (для сравнения)
-- =====================================================
SELECT
  'Расходы БЕЗ дедупликации' as check_name,
  ROUND(SUM(money_spent)::numeric, 2) as total_wrong,
  CASE
    WHEN SUM(money_spent) > 109130 * 1.1 THEN '⚠️ ЕСТЬ ДУБЛИРОВАНИЕ! Коэфф: ' || ROUND((SUM(money_spent) / 109130)::numeric, 1)::text || 'x'
    ELSE '✓ Нет значительного дублирования'
  END as status
FROM ozon_performance_daily
WHERE campaign_name = 'Кабель КГ 2*2,5'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-31';

-- =====================================================
-- ЗАПРОС 4: За неделю (1-7 декабря)
-- Должно быть: ~24 428 ₽
-- =====================================================
SELECT
  'Расходы за неделю (1-7 дек)' as check_name,
  ROUND(SUM(daily_expense)::numeric, 2) as total_week,
  '~24 428' as expected,
  CASE
    WHEN ABS(SUM(daily_expense) - 24428) < 100 THEN '✅ СОВПАДАЕТ'
    ELSE '❌ Разница: ' || ROUND((SUM(daily_expense) - 24428)::numeric, 2)::text || ' ₽'
  END as status
FROM (
  SELECT stat_date, MAX(money_spent) as daily_expense
  FROM ozon_performance_daily
  WHERE campaign_name = 'Кабель КГ 2*2,5'
    AND stat_date >= '2025-12-01'
    AND stat_date <= '2025-12-07'
  GROUP BY stat_date
) as daily_unique;

-- =====================================================
-- ЗАПРОС 5: Какие даты отсутствуют?
-- (только если количество дней < 31)
-- =====================================================
WITH all_dates AS (
  SELECT generate_series(
    '2025-12-01'::date,
    '2025-12-31'::date,
    '1 day'::interval
  )::date as date
),
existing_dates AS (
  SELECT DISTINCT stat_date::date as date
  FROM ozon_performance_daily
  WHERE campaign_name = 'Кабель КГ 2*2,5'
    AND stat_date >= '2025-12-01'
    AND stat_date <= '2025-12-31'
)
SELECT
  'Отсутствующие даты' as check_name,
  string_agg(a.date::text, ', ' ORDER BY a.date) as missing_dates,
  COUNT(*) as missing_count
FROM all_dates a
LEFT JOIN existing_dates e ON a.date = e.date
WHERE e.date IS NULL
GROUP BY 1
HAVING COUNT(*) > 0;

-- =====================================================
-- ЗАПРОС 6: Детали по первым 7 дням
-- =====================================================
SELECT
  stat_date,
  MAX(money_spent) as money_spent_per_day,
  COUNT(*) as records_count,
  COUNT(DISTINCT sku) as unique_skus,
  CASE
    WHEN MIN(money_spent) = MAX(money_spent) THEN '✅ Одинаковые'
    ELSE '❌ Разные!'
  END as all_same
FROM ozon_performance_daily
WHERE campaign_name = 'Кабель КГ 2*2,5'
  AND stat_date >= '2025-12-01'
  AND stat_date <= '2025-12-07'
GROUP BY stat_date
ORDER BY stat_date;

-- =====================================================
-- ИТОГИ
-- =====================================================
-- Если все ✅:
--   - Данные в БД КОРРЕКТНЫЕ
--   - Проблема в frontend коде или деплое
--
-- Если есть ❌:
--   - Проблема в данных БД
--   - Нужна синхронизация OZON
-- =====================================================
