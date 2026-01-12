-- CRITICAL FIX: Delete massive duplicate drafted replies
-- Problem: Some reviews have 900+ drafted replies causing unique constraint violations
-- Solution: Keep only the NEWEST reply per review_id, delete all older ones

-- Step 1: Delete all duplicate drafted replies (keep only newest)
DELETE FROM replies
WHERE id IN (
  SELECT r1.id
  FROM replies r1
  WHERE r1.review_id IS NOT NULL
    AND r1.deleted_at IS NULL
    AND r1.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
    AND EXISTS (
      SELECT 1
      FROM replies r2
      WHERE r2.review_id = r1.review_id
        AND r2.deleted_at IS NULL
        AND r2.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
        AND r2.created_at > r1.created_at
      LIMIT 1
    )
);

-- Step 2: Verify no more duplicates exist
SELECT review_id, COUNT(*) as count
FROM replies
WHERE review_id IS NOT NULL
  AND deleted_at IS NULL
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY review_id
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 10;

-- Step 3: Check final status counts
SELECT status, COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
