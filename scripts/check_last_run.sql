-- Check what happened in the last auto-generate run

-- 1. Check all scheduled replies (should be 30)
SELECT COUNT(*) as scheduled_count
FROM replies
WHERE status = 'scheduled'
  AND deleted_at IS NULL
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- 2. Check recent replies with review ratings
SELECT
  r.id,
  r.status,
  r.mode,
  r.created_at,
  rev.rating,
  rev.segment
FROM replies r
JOIN reviews rev ON rev.id = r.review_id
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.deleted_at IS NULL
  AND r.created_at > NOW() - INTERVAL '10 minutes'
ORDER BY r.created_at DESC
LIMIT 30;

-- 3. Check unanswered 4-5 star reviews (should process these)
SELECT
  id,
  rating,
  segment,
  review_date
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND segment = 'unanswered'
  AND rating IN (4, 5)
  AND deleted_at IS NULL
ORDER BY rating DESC, review_date DESC
LIMIT 10;
