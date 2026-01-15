-- Force fix the 2 pending reviews that have no replies
-- VERSION: 2026-01-15-v1

-- These 2 reviews have segment='pending' but NO replies - this is wrong!
-- They should be 'unanswered'

DO $$
DECLARE
  v_review_1 UUID := '39bea49c-5c5b-4da8-b8ce-99e4cf4edaa4';
  v_review_2 UUID := '02b18707-1b81-4945-a768-3a10927e0e2b';
BEGIN
  RAISE NOTICE 'Fixing 2 reviews with wrong segment...';

  -- Check what calculate_review_segment returns for them
  RAISE NOTICE 'Review 1 calculated segment: %', public.calculate_review_segment(v_review_1);
  RAISE NOTICE 'Review 2 calculated segment: %', public.calculate_review_segment(v_review_2);

  -- Force update to 'unanswered' since they have no replies
  UPDATE reviews
  SET segment = 'unanswered',
      updated_at = NOW()
  WHERE id IN (v_review_1, v_review_2);

  RAISE NOTICE '✅ Fixed 2 reviews to unanswered';
END $$;

-- Verify
SELECT
  r.id,
  r.rating,
  r.segment,
  r.is_answered,
  COUNT(rep.id) as replies_count
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.id IN (
  '39bea49c-5c5b-4da8-b8ce-99e4cf4edaa4',
  '02b18707-1b81-4945-a768-3a10927e0e2b'
)
GROUP BY r.id, r.rating, r.segment, r.is_answered;

-- Show final count by segment
SELECT segment, COUNT(*) as count
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND rating IN (4, 5)
GROUP BY segment
ORDER BY segment;
