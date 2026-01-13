-- ====================================
-- КОМПЛЕКСНАЯ ПРОВЕРКА СИНХРОНИЗАЦИИ
-- ====================================
-- Этот скрипт проверяет:
-- 1. Статус последних синхронизаций
-- 2. Объём данных в таблице
-- 3. Период покрытия данными
-- 4. Наличие VIEW для автосуммирования
-- 5. Проверку корректности суммирования

\echo '==========================================';
\echo '1. СТАТУС ПОСЛЕДНИХ СИНХРОНИЗАЦИЙ';
\echo '==========================================';

SELECT
  status,
  TO_CHAR(started_at, 'DD.MM.YYYY HH24:MI') as started,
  TO_CHAR(completed_at, 'DD.MM.YYYY HH24:MI') as completed,
  ROUND(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at))/60, 1) as duration_min,
  campaigns_count as campaigns,
  rows_inserted as rows,
  CASE
    WHEN error_message IS NULL OR error_message = '' THEN '✅ OK'
    ELSE SUBSTRING(error_message, 1, 80)
  END as status_message
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
ORDER BY started_at DESC
LIMIT 10;

\echo '';
\echo '==========================================';
\echo '2. СТАТИСТИКА ПО ДАННЫМ В ТАБЛИЦЕ';
\echo '==========================================';

SELECT
  TO_CHAR(MIN(stat_date), 'DD.MM.YYYY') as first_date,
  TO_CHAR(MAX(stat_date), 'DD.MM.YYYY') as last_date,
  (MAX(stat_date) - MIN(stat_date) + 1) as days_count,
  COUNT(*) as total_records,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  COUNT(DISTINCT stat_date) as unique_days
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

\echo '';
\echo '==========================================';
\echo '3. СУММЫ ЗАКАЗОВ И ВЫРУЧКИ';
\echo '==========================================';

SELECT
  SUM(orders) as orders,
  SUM(orders_model) as orders_model,
  SUM(orders) + SUM(orders_model) as total_orders,
  ROUND(SUM(revenue)::numeric, 2) as revenue,
  ROUND(SUM(revenue_model)::numeric, 2) as revenue_model,
  ROUND((SUM(revenue) + SUM(revenue_model))::numeric, 2) as total_revenue
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

\echo '';
\echo '==========================================';
\echo '4. ПРОВЕРКА СУЩЕСТВОВАНИЯ VIEW';
\echo '==========================================';

SELECT
  table_name,
  CASE table_type
    WHEN 'BASE TABLE' THEN '📊 Таблица'
    WHEN 'VIEW' THEN '👁️ VIEW'
    ELSE table_type
  END as type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ozon_performance_daily', 'ozon_performance_summary')
ORDER BY table_name;

\echo '';
\echo '==========================================';
\echo '5. ПРОВЕРКА РАБОТЫ VIEW (5 последних дней)';
\echo '==========================================';

SELECT
  TO_CHAR(stat_date, 'DD.MM.YYYY') as date,
  COUNT(*) as records,
  SUM(orders) as orders,
  SUM(orders_model) as orders_model,
  SUM(total_orders) as total_orders_view,
  ROUND(SUM(revenue)::numeric, 2) as revenue,
  ROUND(SUM(revenue_model)::numeric, 2) as revenue_model,
  ROUND(SUM(total_revenue)::numeric, 2) as total_revenue_view
FROM ozon_performance_summary
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY stat_date
ORDER BY stat_date DESC
LIMIT 5;

\echo '';
\echo '==========================================';
\echo '6. СРАВНЕНИЕ: ТАБЛИЦА vs VIEW';
\echo '==========================================';

WITH table_data AS (
  SELECT
    SUM(orders) + SUM(orders_model) as total_orders,
    SUM(revenue) + SUM(revenue_model) as total_revenue
  FROM ozon_performance_daily
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
),
view_data AS (
  SELECT
    SUM(total_orders) as total_orders,
    SUM(total_revenue) as total_revenue
  FROM ozon_performance_summary
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
)
SELECT
  'Таблица (ручной расчёт)' as source,
  t.total_orders,
  ROUND(t.total_revenue::numeric, 2) as total_revenue
FROM table_data t
UNION ALL
SELECT
  'VIEW (автосуммирование)' as source,
  v.total_orders,
  ROUND(v.total_revenue::numeric, 2) as total_revenue
FROM view_data v;

\echo '';
\echo '==========================================';
\echo '7. ТОП-5 КАМПАНИЙ ПО ЗАКАЗАМ (через VIEW)';
\echo '==========================================';

SELECT
  campaign_name,
  SUM(total_orders) as orders,
  ROUND(SUM(total_revenue)::numeric, 2) as revenue,
  ROUND(SUM(money_spent)::numeric, 2) as spent,
  ROUND(AVG(roi)::numeric, 1) as avg_roi,
  ROUND(AVG(drr)::numeric, 1) as avg_drr
FROM ozon_performance_summary
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND stat_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY campaign_name
ORDER BY orders DESC
LIMIT 5;

\echo '';
\echo '==========================================';
\echo '8. ПРОВЕРКА НАЛИЧИЯ ЗАВИСШИХ СИНХРОНИЗАЦИЙ';
\echo '==========================================';

SELECT
  COUNT(*) as stuck_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ Нет зависших синхронизаций'
    ELSE '⚠️ Есть зависшие синхронизации старше 30 минут'
  END as status
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'in_progress'
  AND started_at < NOW() - INTERVAL '30 minutes';

\echo '';
\echo '==========================================';
\echo 'ИТОГОВАЯ ОЦЕНКА';
\echo '==========================================';

WITH checks AS (
  SELECT
    CASE
      WHEN COUNT(*) FILTER (WHERE status = 'completed' AND error_message IS NULL OR error_message = '') >= 1
      THEN '✅' ELSE '❌'
    END as sync_ok,
    CASE
      WHEN MAX(stat_date) - MIN(stat_date) + 1 >= 62
      THEN '✅' ELSE '⚠️'
    END as period_ok
  FROM (
    SELECT status, error_message FROM ozon_sync_history
    WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
    ORDER BY started_at DESC LIMIT 5
  ) recent_syncs,
  (
    SELECT MIN(stat_date) as min_date, MAX(stat_date) as max_date
    FROM ozon_performance_daily
    WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  ) dates
),
view_check AS (
  SELECT
    CASE
      WHEN COUNT(*) > 0 THEN '✅' ELSE '❌'
    END as view_exists
  FROM information_schema.tables
  WHERE table_name = 'ozon_performance_summary'
)
SELECT
  c.sync_ok || ' Последние синхронизации' as check_1,
  c.period_ok || ' Период данных (нужно ≥62 дня)' as check_2,
  v.view_exists || ' VIEW для автосуммирования' as check_3
FROM checks c, view_check v;

\echo '';
\echo '==========================================';
\echo 'РЕКОМЕНДАЦИИ:';
\echo '==========================================';
\echo '- Если период < 62 дня: запустите ПРОВЕРКА_И_ЗАПУСК_ПОЛНОЙ_СИНХРОНИЗАЦИИ.sql';
\echo '- Если VIEW отсутствует: запустите CREATE_VIEW_AUTO_SUM.sql';
\echo '- Если есть ошибки: проверьте логи последней синхронизации';
\echo '==========================================';
