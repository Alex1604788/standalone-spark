-- Тест производительности запросов reviews

-- 1. Простой count без фильтров (проверка базовой производительности)
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM reviews
WHERE deleted_at IS NULL;

-- 2. Count с фильтром по marketplace_id (как в коде)
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM reviews
WHERE deleted_at IS NULL
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- 3. Count с фильтром по segment
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM reviews
WHERE deleted_at IS NULL
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND segment = 'unanswered';

-- 4. Запрос с JOIN как в коде (100 записей)
EXPLAIN ANALYZE
SELECT r.*, p.name, p.offer_id, p.image_url
FROM reviews r
LEFT JOIN products p ON p.id = r.product_id
WHERE r.deleted_at IS NULL
  AND r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.segment = 'unanswered'
ORDER BY r.review_date DESC
LIMIT 100;

-- 5. Проверка RLS - включена ли она для reviews
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'reviews';

-- 6. Список всех политик для reviews
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'reviews';
