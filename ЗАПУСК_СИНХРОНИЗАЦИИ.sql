-- =====================================================
-- ЗАПУСК СИНХРОНИЗАЦИИ OZON PERFORMANCE (DAILY)
-- =====================================================
-- Этот скрипт запускает синхронизацию за последние 7 дней
-- Выполните в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql
-- =====================================================

-- Вариант 1: Через HTTP запрос (рекомендуется)
SELECT net.http_post(
  url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon-performance',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
  ),
  body := jsonb_build_object(
    'marketplace_id', '84b1d0f5-6750-407c-9b04-28c051972162',
    'sync_period', 'daily'
  )
);

-- Вариант 2: Через прямой вызов функции (если есть)
-- SELECT trigger_ozon_daily_sync();

-- =====================================================
-- ПРОВЕРКА РЕЗУЛЬТАТА (выполните через 10-15 минут)
-- =====================================================

SELECT
  status,
  started_at,
  completed_at,
  campaigns_count,
  rows_inserted,
  error_message
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
ORDER BY started_at DESC
LIMIT 1;

-- Ожидаемый результат:
-- status: 'in_progress' (во время работы) или 'completed' (после завершения)
-- rows_inserted: > 0
-- error_message: NULL или пусто

-- =====================================================
-- ПРОВЕРКА ОБНОВЛЕННЫХ ДАННЫХ
-- =====================================================

SELECT
  MAX(stat_date) as last_date,
  COUNT(*) as total_records
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- Должно показать дату 2026-01-13 или близкую

-- =====================================================
-- ПРОВЕРКА РАБОТЫ VIEW
-- =====================================================

SELECT
  stat_date,
  SUM(orders) as orders,
  SUM(orders_model) as orders_model,
  SUM(total_orders) as total_orders_from_view,
  SUM(revenue) as revenue,
  SUM(revenue_model) as revenue_model,
  SUM(total_revenue) as total_revenue_from_view
FROM ozon_performance_summary
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY stat_date
ORDER BY stat_date DESC
LIMIT 5;

-- Должно показать:
-- total_orders_from_view = orders + orders_model
-- total_revenue_from_view = revenue + revenue_model
