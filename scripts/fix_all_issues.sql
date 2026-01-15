-- Fix all OZON auto-reply issues in one script
-- VERSION: 2026-01-15-v1
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_count INT;
BEGIN
  RAISE NOTICE '=== Starting OZON auto-reply fix ===';
  RAISE NOTICE '';

  -- STEP 1: Fix review segments (pending without replies → unanswered)
  RAISE NOTICE '1️⃣ Fixing review segments...';

  UPDATE reviews r
  SET
    segment = public.calculate_review_segment(r.id),
    updated_at = NOW()
  WHERE r.marketplace_id = v_marketplace_id
    AND r.deleted_at IS NULL
    AND r.segment != public.calculate_review_segment(r.id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '   ✅ Fixed % reviews with wrong segment', v_count;
  RAISE NOTICE '';

  -- STEP 2: Enable API mode for automatic publishing
  RAISE NOTICE '2️⃣ Enabling API mode...';

  UPDATE marketplaces
  SET
    sync_mode = 'api',
    updated_at = NOW()
  WHERE id = v_marketplace_id;

  RAISE NOTICE '   ✅ Enabled API mode';
  RAISE NOTICE '';

  -- STEP 3: Reset any stuck publishing replies
  RAISE NOTICE '3️⃣ Resetting stuck replies...';

  UPDATE replies
  SET
    status = 'scheduled',
    scheduled_at = NOW() + INTERVAL '1 minute',
    error_message = 'Reset from stuck status',
    retry_count = COALESCE(retry_count, 0) + 1,
    updated_at = NOW()
  WHERE marketplace_id = v_marketplace_id
    AND status = 'publishing'
    AND deleted_at IS NULL
    AND updated_at < NOW() - INTERVAL '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '   ✅ Reset % stuck replies', v_count;
  RAISE NOTICE '';

  RAISE NOTICE '=== Fix complete! ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Deploy function v5 (with detailed logging)';
  RAISE NOTICE '2. Run: ./scripts/test_auto_generate.sh';
  RAISE NOTICE '3. Check Supabase Edge Function logs';
END $$;

-- Show final state
SELECT 'Reviews by segment' as info, segment, COUNT(*) as count
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND rating IN (4, 5)
GROUP BY segment
ORDER BY segment;

SELECT 'Marketplace settings' as info, sync_mode
FROM marketplaces
WHERE id = '84b1d0f5-6750-407c-9b04-28c051972162';
