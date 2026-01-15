-- SIMPLIFIED APPROACH: Execute these queries ONE BY ONE

-- Query 1: Drop the constraint
DROP INDEX IF EXISTS idx_unique_active_review_reply;

-- Query 2: Simple delete (may take time but should work)
DELETE FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND status = 'drafted';

-- Query 3: Recreate constraint
CREATE UNIQUE INDEX idx_unique_active_review_reply
  ON replies (review_id)
  WHERE deleted_at IS NULL
    AND status IN ('scheduled', 'publishing', 'drafted');

-- Query 4: Reset stuck replies
UPDATE replies
SET status = 'scheduled', retry_count = 0, error_message = NULL, scheduled_at = NOW(), updated_at = NOW()
WHERE status IN ('publishing', 'failed')
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL;

-- Query 5: Check results
SELECT status, COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
