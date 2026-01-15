-- Check if segment is in sync with actual replies

-- 1. Reviews with segment='pending' but NO replies
SELECT
  'pending_no_replies' as issue_type,
  r.id,
  r.rating,
  r.segment,
  r.is_answered,
  COUNT(rep.id) as replies_count
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.segment = 'pending'
  AND r.deleted_at IS NULL
GROUP BY r.id, r.rating, r.segment, r.is_answered
HAVING COUNT(rep.id) = 0
LIMIT 10;

-- 2. Reviews with segment='unanswered' but HAS scheduled replies
SELECT
  'unanswered_has_replies' as issue_type,
  r.id,
  r.rating,
  r.segment,
  r.is_answered,
  COUNT(rep.id) as replies_count,
  STRING_AGG(rep.status::text, ', ') as reply_statuses
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.segment = 'unanswered'
  AND r.deleted_at IS NULL
GROUP BY r.id, r.rating, r.segment, r.is_answered
HAVING COUNT(rep.id) > 0
LIMIT 10;

-- 3. Count by segment and actual replies existence
SELECT
  r.segment,
  COUNT(*) FILTER (WHERE rep.id IS NULL) as without_replies,
  COUNT(*) FILTER (WHERE rep.id IS NOT NULL) as with_replies
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.deleted_at IS NULL
GROUP BY r.segment
ORDER BY r.segment;
