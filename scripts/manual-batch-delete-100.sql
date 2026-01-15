-- MANUAL BATCH DELETE: Run this query MULTIPLE TIMES (10-20 times)
-- Each run will delete 100 drafted replies
-- Keep running until it returns "DELETE 0"

DELETE FROM replies
WHERE id IN (
  SELECT id
  FROM replies
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
    AND deleted_at IS NULL
    AND status = 'drafted'
  LIMIT 100
);

-- After this returns "DELETE 0", run these queries:

-- Recreate constraint:
-- CREATE UNIQUE INDEX idx_unique_active_review_reply ON replies (review_id) WHERE deleted_at IS NULL AND status IN ('scheduled', 'publishing', 'drafted');

-- Reset stuck replies:
-- UPDATE replies SET status = 'scheduled', retry_count = 0, error_message = NULL, scheduled_at = NOW(), updated_at = NOW() WHERE status IN ('publishing', 'failed') AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162' AND deleted_at IS NULL;

-- Check results:
-- SELECT status, COUNT(*) FROM replies WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162' AND deleted_at IS NULL GROUP BY status;
