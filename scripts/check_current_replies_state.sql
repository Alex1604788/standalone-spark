-- Check current state of replies after cleanup
-- Show what's actually in the database

SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;

-- Check if there are any replies with old created_at dates
SELECT
  id,
  status,
  mode,
  created_at,
  updated_at,
  deleted_at IS NOT NULL as is_deleted
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status IN ('drafted', 'failed', 'scheduled')
ORDER BY status, created_at DESC
LIMIT 20;
