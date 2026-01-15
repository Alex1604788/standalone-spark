-- Step 1: Delete older duplicate replies for the same review_id
-- Keep only the newest reply per review
DELETE FROM replies
WHERE id IN (
  SELECT r1.id
  FROM replies r1
  WHERE r1.review_id IS NOT NULL
    AND r1.deleted_at IS NULL
    AND r1.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
    AND EXISTS (
      SELECT 1 FROM replies r2
      WHERE r2.review_id = r1.review_id
        AND r2.deleted_at IS NULL
        AND r2.created_at > r1.created_at
        AND r2.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
    )
);

-- Step 2: Now reset stuck replies (after removing duplicates)
UPDATE replies
SET
  status = 'scheduled',
  retry_count = 0,
  error_message = NULL,
  scheduled_at = NOW(),
  updated_at = NOW()
WHERE status IN ('publishing', 'failed')
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL;

-- Step 3: Check results
SELECT status, COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
