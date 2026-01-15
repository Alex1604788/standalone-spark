-- SOLUTION: Disable constraint, delete drafts, re-enable constraint
-- The unique constraint idx_unique_active_review_reply causes deadlocks

-- Step 1: Drop the unique constraint temporarily
DROP INDEX IF EXISTS idx_unique_active_review_reply;

-- Step 2: Now delete drafted replies in smaller batches (should work without deadlock)
-- Run this query multiple times until it returns 0 rows
DO $$
DECLARE
  deleted_count INT;
  total_deleted INT := 0;
BEGIN
  LOOP
    DELETE FROM replies
    WHERE id IN (
      SELECT id FROM replies
      WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
        AND deleted_at IS NULL
        AND status = 'drafted'
      LIMIT 1000
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;

    EXIT WHEN deleted_count = 0;

    RAISE NOTICE 'Deleted % rows, total: %', deleted_count, total_deleted;
    COMMIT;
  END LOOP;

  RAISE NOTICE 'Total deleted: %', total_deleted;
END $$;

-- Step 3: Recreate the unique constraint (but make it partial - only for non-published statuses)
CREATE UNIQUE INDEX idx_unique_active_review_reply
  ON replies (review_id)
  WHERE deleted_at IS NULL
    AND status IN ('scheduled', 'publishing', 'drafted');

-- Step 4: Now safely reset stuck replies
UPDATE replies
SET status = 'scheduled', retry_count = 0, error_message = NULL, scheduled_at = NOW(), updated_at = NOW()
WHERE status IN ('publishing', 'failed')
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL;

-- Step 5: Check final results
SELECT status, COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
