-- Check if optimization indexes exist
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'reviews'
  AND indexname LIKE 'idx_reviews_%'
ORDER BY indexname;
