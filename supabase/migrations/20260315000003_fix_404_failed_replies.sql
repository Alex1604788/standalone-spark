-- Migration: Fix replies stuck in 'failed' due to 404 (review deleted in OZON)
-- These reviews stay in 'pending' segment showing "Ошибка" forever because
-- calculate_review_segment() includes 'failed' in has_pending check.
-- Fix: soft-delete the reply + set is_answered=true → review moves to 'archived'.

-- Step 1: Find and soft-delete replies with 404 errors
UPDATE replies
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND status = 'failed'
  AND error_message LIKE '%404%';

-- Step 2: Archive reviews whose only non-deleted replies are now deleted (all were 404)
-- Set is_answered=true so calculate_review_segment() returns 'archived'
UPDATE reviews r
SET is_answered = true
WHERE deleted_at IS NULL
  AND is_answered = false
  AND NOT EXISTS (
    SELECT 1 FROM replies rep
    WHERE rep.review_id = r.id
      AND rep.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM replies rep
    WHERE rep.review_id = r.id
      AND rep.deleted_at IS NOT NULL
      AND rep.error_message LIKE '%404%'
  );

-- Verify
DO $$
DECLARE
  v_failed_404 INT;
  v_still_pending INT;
BEGIN
  SELECT COUNT(*) INTO v_failed_404
  FROM replies WHERE status = 'failed' AND error_message LIKE '%404%' AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_still_pending
  FROM reviews r
  WHERE r.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM replies rep
      WHERE rep.review_id = r.id AND rep.status = 'failed' AND rep.deleted_at IS NULL
    );

  RAISE NOTICE 'After fix — remaining active failed-404 replies: %, reviews with failed replies: %',
    v_failed_404, v_still_pending;
END $$;
