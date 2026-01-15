-- Check what really happened with last auto-generate run

-- 1. Count ALL replies created in last 15 minutes
SELECT
  status,
  COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND created_at > NOW() - INTERVAL '15 minutes'
GROUP BY status;

-- 2. Get details of recently created replies with review ratings
SELECT
  r.id as reply_id,
  r.status,
  r.mode,
  r.content as reply_content_preview,
  r.created_at,
  rev.id as review_id,
  rev.rating,
  rev.segment
FROM replies r
JOIN reviews rev ON rev.id = r.review_id
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.deleted_at IS NULL
  AND r.created_at > NOW() - INTERVAL '15 minutes'
ORDER BY r.created_at DESC;
