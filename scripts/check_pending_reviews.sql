-- Check the 2 pending reviews - do they have replies?
-- VERSION: 2026-01-15-v1

-- Find the 2 pending reviews
SELECT
  r.id as review_id,
  r.rating,
  r.segment,
  r.is_answered,
  COUNT(rep.id) as replies_count,
  STRING_AGG(rep.status::text, ', ') as reply_statuses
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.deleted_at IS NULL
  AND r.rating IN (4, 5)
  AND r.segment = 'pending'
GROUP BY r.id, r.rating, r.segment, r.is_answered;

-- Count unanswered reviews (should exist but don't show in results)
SELECT
  'Reviews with segment=unanswered' as info,
  COUNT(*) as count
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND rating IN (4, 5)
  AND segment = 'unanswered';

-- Maybe segment calculation is wrong?
-- Let's check what calculate_review_segment returns for these 2 pending reviews
SELECT
  r.id as review_id,
  r.rating,
  r.segment as current_segment,
  r.is_answered,
  public.calculate_review_segment(r.id) as calculated_segment,
  EXISTS(SELECT 1 FROM replies WHERE review_id = r.id AND deleted_at IS NULL) as has_replies
FROM reviews r
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.deleted_at IS NULL
  AND r.rating IN (4, 5)
  AND r.segment = 'pending'
LIMIT 5;
