-- Debug: Check what really happened with auto-generate
-- This will show if replies were created and why they don't show in UI

-- 1. Check scheduled replies created in last 30 minutes
SELECT
  r.id,
  r.status,
  r.review_id,
  r.created_at,
  rev.rating,
  rev.segment,
  rev.text as review_text
FROM replies r
JOIN reviews rev ON rev.id = r.review_id
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.status = 'scheduled'
  AND r.deleted_at IS NULL
  AND r.created_at > NOW() - INTERVAL '30 minutes'
ORDER BY r.created_at DESC
LIMIT 10;

-- 2. Check if any 5-star reviews have segment = 'pending' (means reply exists)
SELECT
  id,
  rating,
  segment,
  updated_at
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND rating = 5
  AND segment = 'pending'
LIMIT 10;

-- 3. Count reviews by rating and segment
SELECT
  rating,
  segment,
  COUNT(*) as count
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND rating IN (4, 5)
GROUP BY rating, segment
ORDER BY rating DESC, segment;

-- 4. Check if triggers are enabled
SELECT
  tgname,
  tgenabled
FROM pg_trigger
WHERE tgrelid = 'replies'::regclass
  AND tgname LIKE '%review%'
ORDER BY tgname;
