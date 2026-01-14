-- Clean up old drafted replies and reset failed replies
-- Run this in Supabase SQL Editor

-- 1. Delete all drafted replies (old ones that shouldn't exist)
UPDATE replies
SET deleted_at = NOW()
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'drafted'
  AND deleted_at IS NULL;

-- 2. Reset failed replies to scheduled for retry
UPDATE replies
SET
  status = 'scheduled',
  retry_count = 0,
  error_message = NULL,
  scheduled_at = NOW()
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'failed'
  AND deleted_at IS NULL;

-- 3. Update review segments for affected reviews
UPDATE reviews r
SET segment = calculate_review_segment(r.id),
    updated_at = NOW()
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.segment = 'pending';

-- 4. Show cleanup results
SELECT
  'drafted_deleted' as action,
  COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'drafted'
  AND deleted_at > NOW() - INTERVAL '1 minute'
UNION ALL
SELECT
  'failed_reset_to_scheduled' as action,
  COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'scheduled'
  AND updated_at > NOW() - INTERVAL '1 minute';
