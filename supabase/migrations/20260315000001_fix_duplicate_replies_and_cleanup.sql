-- =====================================================================
-- FIX: Duplicate replies, duplicate triggers, duplicate cron jobs
-- DATE: 2026-03-15
-- =====================================================================

-- STEP 1: Soft-delete extra published replies for reviews that have 2+
-- Keep MIN(id) (first published reply), soft-delete the rest
UPDATE replies r
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND status = 'published'
  AND review_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM replies
    WHERE status = 'published'
      AND deleted_at IS NULL
      AND review_id IS NOT NULL
    GROUP BY review_id
  )
  AND review_id IN (
    SELECT review_id
    FROM replies
    WHERE status = 'published'
      AND deleted_at IS NULL
      AND review_id IS NOT NULL
    GROUP BY review_id
    HAVING COUNT(*) > 1
  );

-- STEP 2: Add unique partial index to prevent future duplicate active replies per review
-- Only one non-deleted reply allowed per review_id at any time
-- This blocks concurrent auto-generate inserts at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_reply_per_review
  ON replies (review_id)
  WHERE deleted_at IS NULL AND review_id IS NOT NULL;

-- STEP 3: Drop duplicate triggers on reviews table
-- All 3 call the same function update_review_segment_on_review_change
-- Keep only the canonical one: update_review_segment_on_review_change
DROP TRIGGER IF EXISTS review_segment_on_insert_update ON reviews;
DROP TRIGGER IF EXISTS trigger_update_review_segment_on_change ON reviews;

-- STEP 4: Remove duplicate process-scheduled-replies cron
-- Keep: 'process-scheduled-replies' (every minute)
-- Remove: 'process-scheduled-replies-every-10min' (redundant)
SELECT cron.unschedule('process-scheduled-replies-every-10min');

-- STEP 5: Add optimized partial index for reviews queries with deleted_at IS NULL
-- This speeds up: WHERE marketplace_id=? AND segment=? AND deleted_at IS NULL ORDER BY review_date DESC
CREATE INDEX IF NOT EXISTS idx_reviews_mp_seg_deleted_date
  ON reviews (marketplace_id, segment, review_date DESC)
  WHERE deleted_at IS NULL;

-- Verify results
DO $$
DECLARE
  dup_count INTEGER;
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT review_id FROM replies
    WHERE status = 'published' AND deleted_at IS NULL AND review_id IS NOT NULL
    GROUP BY review_id HAVING COUNT(*) > 1
  ) t;

  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE event_object_table = 'reviews'
    AND trigger_name IN ('review_segment_on_insert_update','trigger_update_review_segment_on_change')
    AND trigger_schema = 'public';

  RAISE NOTICE 'Reviews with duplicate published replies after fix: %', dup_count;
  RAISE NOTICE 'Dropped duplicate triggers still present (should be 0): %', trigger_count;
END $$;
