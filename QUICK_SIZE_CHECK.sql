-- =====================================================
-- БЫСТРАЯ ПРОВЕРКА РАЗМЕРА БД (без таймаута)
-- =====================================================

-- 1. Общий размер базы данных
SELECT
  'Общий размер БД' as metric,
  pg_size_pretty(pg_database_size(current_database())) as size,
  pg_database_size(current_database()) as size_bytes;

-- 2. ТОП-10 самых больших таблиц
SELECT
  schemaname as schema,
  tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as data_size,
  pg_total_relation_size(schemaname||'.'||tablename) as total_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- 3. ТОП-5 самых больших индексов
SELECT
  schemaname as schema,
  tablename as table_name,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size,
  pg_indexes_size(schemaname||'.'||tablename) as indexes_bytes
FROM pg_tables
WHERE schemaname = 'public'
  AND pg_indexes_size(schemaname||'.'||tablename) > 0
ORDER BY pg_indexes_size(schemaname||'.'||tablename) DESC
LIMIT 5;
