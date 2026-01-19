-- =====================================================
-- УПРОЩЕННАЯ ДИАГНОСТИКА РАЗМЕРА БД
-- Запустите в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
-- =====================================================

-- 1. ОБЩИЙ РАЗМЕР БАЗЫ ДАННЫХ
SELECT
  'Общий размер БД' as metric,
  pg_size_pretty(pg_database_size(current_database())) as size
FROM pg_database
WHERE datname = current_database();

-- 2. ТОП 20 САМЫХ БОЛЬШИХ ТАБЛИЦ
SELECT
  schemaname || '.' || tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as data_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size,
  pg_total_relation_size(schemaname||'.'||tablename) as bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- 3. КОЛИЧЕСТВО ЗАПИСЕЙ В ОСНОВНЫХ ТАБЛИЦАХ
SELECT 'reviews' as table_name, COUNT(*) as records FROM reviews
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'chat_messages', COUNT(*) FROM chat_messages
UNION ALL SELECT 'ozon_performance_daily', COUNT(*) FROM ozon_performance_daily
UNION ALL SELECT 'replies', COUNT(*) FROM replies
UNION ALL SELECT 'logs_ai', COUNT(*) FROM logs_ai
UNION ALL SELECT 'ai_reply_history', COUNT(*) FROM ai_reply_history
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log
UNION ALL SELECT 'ozon_sync_history', COUNT(*) FROM ozon_sync_history
UNION ALL SELECT 'import_logs', COUNT(*) FROM import_logs
ORDER BY records DESC;

-- 4. ПРОВЕРКА ДУБЛИКАТОВ
-- Reviews
SELECT
  'reviews' as table_name,
  COUNT(*) as total,
  COUNT(DISTINCT (marketplace_id, review_id)) as unique_records,
  COUNT(*) - COUNT(DISTINCT (marketplace_id, review_id)) as duplicates
FROM reviews;

-- Products
SELECT
  'products' as table_name,
  COUNT(*) as total,
  COUNT(DISTINCT (marketplace_id, sku)) as unique_records,
  COUNT(*) - COUNT(DISTINCT (marketplace_id, sku)) as duplicates
FROM products;

-- 5. СТАРЫЕ ДАННЫЕ (потенциально для удаления)
-- Логи AI старше 90 дней
SELECT
  'logs_ai (>90 дней)' as category,
  COUNT(*) as old_records
FROM logs_ai
WHERE created_at < NOW() - INTERVAL '90 days';

-- История AI ответов старше 90 дней
SELECT
  'ai_reply_history (>90 дней)' as category,
  COUNT(*) as old_records
FROM ai_reply_history
WHERE created_at < NOW() - INTERVAL '90 days';

-- Audit log старше 180 дней
SELECT
  'audit_log (>180 дней)' as category,
  COUNT(*) as old_records
FROM audit_log
WHERE timestamp < NOW() - INTERVAL '180 days';

-- История синхронизации старше 90 дней
SELECT
  'ozon_sync_history (>90 дней)' as category,
  COUNT(*) as old_records
FROM ozon_sync_history
WHERE started_at < NOW() - INTERVAL '90 days';

-- 6. DEAD TUPLES (требуется VACUUM)
SELECT
  schemaname,
  relname as table_name,
  n_dead_tup as dead_tuples,
  n_live_tup as live_tuples,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_percent
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 10;
