-- СРОЧНОЕ ДЕЙСТВИЕ: Удалить дубликаты drafted replies
-- Оставляем только самый новый drafted reply для каждого отзыва

-- ВНИМАНИЕ: Это удалит все дубликаты!
-- Сначала проверь результат первого запроса перед выполнением DELETE

-- 1. СНАЧАЛА ПОСМОТРИ сколько будет удалено:
SELECT COUNT(*) as will_be_deleted
FROM replies r1
WHERE r1.deleted_at IS NULL
  AND r1.status = 'drafted'
  AND r1.review_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM replies r2
    WHERE r2.review_id = r1.review_id
      AND r2.deleted_at IS NULL
      AND r2.status = 'drafted'
      AND r2.created_at > r1.created_at
  );

-- 2. ЕСЛИ ЧИСЛО ВЫГЛЯДИТ ПРАВИЛЬНО, выполни этот DELETE:
-- Удаляем все drafted replies кроме самого нового для каждого review
UPDATE replies
SET deleted_at = NOW()
WHERE id IN (
  SELECT r1.id
  FROM replies r1
  WHERE r1.deleted_at IS NULL
    AND r1.status = 'drafted'
    AND r1.review_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM replies r2
      WHERE r2.review_id = r1.review_id
        AND r2.deleted_at IS NULL
        AND r2.status = 'drafted'
        AND r2.created_at > r1.created_at
    )
);

-- 3. Проверить результат
SELECT
  status,
  COUNT(*) as count
FROM replies
WHERE deleted_at IS NULL
GROUP BY status;
