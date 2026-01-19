-- =====================================================
-- КОЛИЧЕСТВО ЗАПИСЕЙ В ТАБЛИЦАХ
-- =====================================================

SELECT
  schemaname as schema,
  relname as table_name,
  n_live_tup as estimated_rows,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as total_size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
