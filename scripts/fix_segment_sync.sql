-- Fix segment synchronization for all reviews

-- STEP 1: Recalculate segment for ALL reviews
-- This will fix reviews that have segment='pending' but no replies

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_count INT;
BEGIN
  RAISE NOTICE 'Starting segment recalculation for marketplace %', v_marketplace_id;

  -- Update segment for all reviews using the calculate_review_segment function
  UPDATE reviews r
  SET
    segment = public.calculate_review_segment(r.id),
    updated_at = NOW()
  WHERE r.marketplace_id = v_marketplace_id
    AND r.deleted_at IS NULL
    AND r.segment != public.calculate_review_segment(r.id);  -- Only update if different

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Updated segment for % reviews', v_count;
END $$;

-- STEP 2: Verify results
SELECT
  segment,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE rating IN (4,5)) as rating_4_5
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY segment
ORDER BY segment;
