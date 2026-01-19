-- =====================================================
-- ПРОВЕРКА СТАРЫХ ДАННЫХ ДЛЯ АРХИВАЦИИ
-- Запустите в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
-- =====================================================

-- Старые logs_ai (>90 дней)
SELECT
  'logs_ai старше 90 дней' as category,
  COUNT(*) as old_records,
  pg_size_pretty(pg_total_relation_size('public.logs_ai')) as table_total_size
FROM logs_ai
WHERE created_at < NOW() - INTERVAL '90 days';

-- Старые ai_reply_history (>90 дней)
SELECT
  'ai_reply_history старше 90 дней' as category,
  COUNT(*) as old_records,
  pg_size_pretty(pg_total_relation_size('public.ai_reply_history')) as table_total_size
FROM ai_reply_history
WHERE created_at < NOW() - INTERVAL '90 days';

-- Старые audit_log (>180 дней)
SELECT
  'audit_log старше 180 дней' as category,
  COUNT(*) as old_records,
  pg_size_pretty(pg_total_relation_size('public.audit_log')) as table_total_size
FROM audit_log
WHERE created_at < NOW() - INTERVAL '180 days';

-- Старые import_logs (>90 дней)
SELECT
  'import_logs старше 90 дней' as category,
  COUNT(*) as old_records,
  pg_size_pretty(pg_total_relation_size('public.import_logs')) as table_total_size
FROM import_logs
WHERE created_at < NOW() - INTERVAL '90 days';

-- Старые ozon_sync_history (>90 дней)
SELECT
  'ozon_sync_history старше 90 дней' as category,
  COUNT(*) as old_records,
  pg_size_pretty(pg_total_relation_size('public.ozon_sync_history')) as table_total_size
FROM ozon_sync_history
WHERE synced_at < NOW() - INTERVAL '90 days';
