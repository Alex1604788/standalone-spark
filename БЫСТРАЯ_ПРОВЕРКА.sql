-- =====================================================
-- БЫСТРАЯ ПРОВЕРКА СИНХРОНИЗАЦИИ
-- =====================================================
-- Запустите в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql
-- =====================================================

-- 1. Последняя синхронизация
SELECT
  '1️⃣ ПОСЛЕДНЯЯ СИНХРОНИЗАЦИЯ' as check_name,
  status,
  TO_CHAR(started_at, 'DD.MM HH24:MI') as started,
  TO_CHAR(completed_at, 'DD.MM HH24:MI') as completed,
  campaigns_count as campaigns,
  rows_inserted as rows,
  CASE
    WHEN error_message IS NULL OR error_message = '' THEN '✅ OK'
    ELSE '❌ ' || SUBSTRING(error_message, 1, 50)
  END as result
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
ORDER BY started_at DESC
LIMIT 1;

-- 2. Период данных
SELECT
  '2️⃣ ПЕРИОД ДАННЫХ' as check_name,
  TO_CHAR(MIN(stat_date), 'DD.MM.YYYY') as first_date,
  TO_CHAR(MAX(stat_date), 'DD.MM.YYYY') as last_date,
  (MAX(stat_date) - MIN(stat_date) + 1) as days,
  CASE
    WHEN (MAX(stat_date) - MIN(stat_date) + 1) >= 62 THEN '✅ Есть 62+ дня'
    ELSE '⚠️ Меньше 62 дней'
  END as result,
  COUNT(*) as records
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- 3. Наличие VIEW
SELECT
  '3️⃣ VIEW ДЛЯ АВТОСУММИРОВАНИЯ' as check_name,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ VIEW существует'
    ELSE '❌ VIEW не найден'
  END as result
FROM information_schema.tables
WHERE table_name = 'ozon_performance_summary';

-- 4. Проверка суммирования (последний день)
SELECT
  '4️⃣ ПРОВЕРКА СУММИРОВАНИЯ' as check_name,
  stat_date,
  SUM(orders) as orders,
  SUM(orders_model) as orders_model,
  SUM(orders) + SUM(orders_model) as manual_sum,
  SUM(total_orders) as view_total,
  CASE
    WHEN SUM(orders) + SUM(orders_model) = SUM(total_orders) THEN '✅ Суммирование работает'
    ELSE '❌ Ошибка суммирования'
  END as result
FROM ozon_performance_summary
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND stat_date = (
    SELECT MAX(stat_date)
    FROM ozon_performance_daily
    WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  )
GROUP BY stat_date;

-- 5. Итоги
SELECT
  '📊 ИТОГОВАЯ СТАТИСТИКА' as summary,
  COUNT(*) as total_records,
  COUNT(DISTINCT stat_date) as unique_days,
  SUM(total_orders) as total_orders,
  ROUND(SUM(total_revenue)::numeric, 2) as total_revenue,
  ROUND(SUM(money_spent)::numeric, 2) as total_spent
FROM ozon_performance_summary
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';
