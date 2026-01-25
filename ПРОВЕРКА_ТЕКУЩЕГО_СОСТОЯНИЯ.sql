-- =====================================================
-- ПРОВЕРКА ТЕКУЩЕГО СОСТОЯНИЯ БАЗЫ ДАННЫХ
-- Запустите этот скрипт в Supabase SQL Editor
-- =====================================================

-- 1. СПИСОК ВСЕХ АКТИВНЫХ CRON ЗАДАЧ
-- =====================================================
SELECT
  jobid,
  jobname,
  schedule,
  active,
  CASE
    WHEN jobname LIKE '%cleanup%' THEN '🧹 Очистка'
    WHEN jobname LIKE '%sync%' THEN '🔄 Синхронизация'
    WHEN jobname LIKE '%generate%' THEN '🤖 Генерация'
    ELSE '📋 Другое'
  END as category,
  command
FROM cron.job
ORDER BY
  CASE
    WHEN jobname LIKE '%cleanup%' THEN 1
    WHEN jobname LIKE '%sync%' THEN 2
    WHEN jobname LIKE '%generate%' THEN 3
    ELSE 4
  END,
  jobname;

-- 2. РАЗМЕРЫ ВСЕХ ТАБЛИЦ (С ЛОГАМИ И БЕЗ)
-- =====================================================
SELECT
  schemaname as schema,
  tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS data_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size,
  CASE
    WHEN tablename LIKE '%_log%' OR tablename LIKE '%_logs%' OR tablename LIKE '%_history' THEN '📊 ЛОГ'
    ELSE '💾 ДАННЫЕ'
  END as type
FROM pg_tables
WHERE schemaname = 'public' OR schemaname = 'cron'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 30;

-- 3. ТАБЛИЦЫ С ЛОГАМИ - ДЕТАЛЬНАЯ СТАТИСТИКА
-- =====================================================

-- audit_log
SELECT
  'audit_log' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as old_records_7d,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days') as old_records_30d,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  pg_size_pretty(pg_total_relation_size('public.audit_log')) as size
FROM public.audit_log

UNION ALL

-- logs_ai (если существует)
SELECT
  'logs_ai' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as old_records_7d,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days') as old_records_30d,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  pg_size_pretty(pg_total_relation_size('public.logs_ai')) as size
FROM public.logs_ai
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_ai')

UNION ALL

-- ai_reply_history (если существует)
SELECT
  'ai_reply_history' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as old_records_7d,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days') as old_records_30d,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  pg_size_pretty(pg_total_relation_size('public.ai_reply_history')) as size
FROM public.ai_reply_history
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_reply_history')

UNION ALL

-- import_logs (если существует)
SELECT
  'import_logs' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days') as old_records_90d,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '180 days') as old_records_180d,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  pg_size_pretty(pg_total_relation_size('public.import_logs')) as size
FROM public.import_logs
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_logs')

UNION ALL

-- ozon_sync_history (если существует)
SELECT
  'ozon_sync_history' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days') as old_records_30d,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days') as old_records_90d,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  pg_size_pretty(pg_total_relation_size('public.ozon_sync_history')) as size
FROM public.ozon_sync_history
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync_history')

UNION ALL

-- cron.job_run_details
SELECT
  'cron.job_run_details' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE end_time < NOW() - INTERVAL '7 days') as old_records_7d,
  COUNT(*) FILTER (WHERE end_time < NOW() - INTERVAL '30 days') as old_records_30d,
  MIN(start_time) as oldest_record,
  MAX(start_time) as newest_record,
  pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as size
FROM cron.job_run_details;

-- 4. ИСТОРИЯ ПОСЛЕДНИХ ЗАПУСКОВ CRON ЗАДАЧ
-- =====================================================
SELECT
  jobname,
  start_time,
  end_time,
  status,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds,
  return_message
FROM cron.job_run_details
WHERE start_time > NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC
LIMIT 50;

-- 5. СТАТИСТИКА ПО CLEANUP ЗАДАЧАМ (за последние 24 часа)
-- =====================================================
SELECT
  jobname,
  COUNT(*) as runs_count,
  COUNT(*) FILTER (WHERE status = 'succeeded') as succeeded,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration_sec,
  MAX(end_time) as last_run
FROM cron.job_run_details
WHERE jobname LIKE '%cleanup%'
  AND start_time > NOW() - INTERVAL '24 hours'
GROUP BY jobname
ORDER BY last_run DESC;

-- 6. ПРОВЕРКА СУЩЕСТВОВАНИЯ ФУНКЦИЙ ОЧИСТКИ
-- =====================================================
SELECT
  routine_name as function_name,
  routine_type,
  data_type as return_type,
  CASE
    WHEN routine_name LIKE '%cleanup%' THEN '✅ Функция очистки'
    ELSE '📋 Другая функция'
  END as category
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%cleanup%'
ORDER BY routine_name;

-- 7. ОБЩИЙ РАЗМЕР БАЗЫ ДАННЫХ
-- =====================================================
SELECT
  pg_size_pretty(pg_database_size(current_database())) as total_db_size,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') as total_tables,
  (SELECT COUNT(*) FROM cron.job WHERE active = true) as active_cron_jobs;

-- 8. ТОП-10 САМЫХ БОЛЬШИХ ТАБЛИЦ
-- =====================================================
SELECT
  schemaname || '.' || tablename as table_full_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  CASE
    WHEN tablename LIKE '%_log%' OR tablename LIKE '%_logs%' OR tablename LIKE '%_history' THEN '🔴 ЛОГ'
    ELSE '🟢 ДАННЫЕ'
  END as type
FROM pg_tables
WHERE schemaname IN ('public', 'cron')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- 9. ИНДЕКСЫ НА ТАБЛИЦАХ С ЛОГАМИ (для быстрой очистки)
-- =====================================================
SELECT
  t.tablename as table_name,
  i.indexname as index_name,
  pg_size_pretty(pg_relation_size(i.indexrelid)) as index_size,
  CASE
    WHEN i.indexname LIKE '%created_at%' THEN '✅ Есть индекс по дате'
    ELSE '⚠️ Нет индекса по дате'
  END as has_date_index
FROM pg_tables t
LEFT JOIN pg_indexes i ON t.tablename = i.tablename AND t.schemaname = i.schemaname
WHERE t.schemaname = 'public'
  AND (t.tablename LIKE '%_log%' OR t.tablename LIKE '%_logs%' OR t.tablename LIKE '%_history')
ORDER BY t.tablename, i.indexname;

-- =====================================================
-- КОНЕЦ ПРОВЕРКИ
-- =====================================================

-- СЛЕДУЮЩИЕ ШАГИ:
-- 1. Проанализируйте результаты выше
-- 2. Сверьте с документом ПРАВИЛА_ОЧИСТКИ_ЛОГОВ.md
-- 3. Согласуйте периоды хранения
-- 4. Я создам SQL миграции для автоматической очистки
