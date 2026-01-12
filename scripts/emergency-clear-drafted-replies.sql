-- EMERGENCY FIX: Delete all drafted replies to clear duplicates
-- Drafted replies are not published yet, so it's safe to delete them all
-- Users can regenerate replies for reviews they want to answer

-- Step 1: Count how many drafted replies exist
SELECT COUNT(*) as drafted_count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND status = 'drafted';

-- Step 2: Delete all drafted replies
DELETE FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND status = 'drafted';

-- Step 3: Now reset publishing/failed replies to scheduled
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

-- Step 4: Verify results - should have no duplicates now
SELECT
  status,
  COUNT(*) as count,
  COUNT(DISTINCT review_id) as unique_reviews
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;

-- Step 5: Check for any remaining duplicates
SELECT review_id, COUNT(*) as duplicate_count
FROM replies
WHERE review_id IS NOT NULL
  AND deleted_at IS NULL
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY review_id
HAVING COUNT(*) > 1
LIMIT 10;
