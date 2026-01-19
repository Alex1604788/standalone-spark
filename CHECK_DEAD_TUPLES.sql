-- =====================================================
-- ПРОВЕРКА DEAD TUPLES (нужен ли VACUUM)
-- =====================================================

SELECT
  schemaname as schema,
  relname as table_name,
  n_dead_tup as dead_tuples,
  n_live_tup as live_tuples,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent,
  last_vacuum,
  last_autovacuum,
  CASE
    WHEN n_dead_tup > 10000 AND n_dead_tup > n_live_tup * 0.2 THEN '⚠️ НУЖЕН VACUUM'
    WHEN n_dead_tup > 50000 THEN '⚠️ МНОГО МЕРТВЫХ ЗАПИСЕЙ'
    ELSE '✅ OK'
  END as status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 0
ORDER BY n_dead_tup DESC;
