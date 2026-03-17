-- ============================================================
-- CLEANUP: Archive all old 2025 reviews and cancel their replies
--
-- PROBLEM: Cursor was reset to NULL → synced ~49,554 old UNPROCESSED
-- reviews from OZON (Aug-Nov 2025) that were already answered in
-- OZON seller center. These should NOT go through auto-reply pipeline.
--
-- ACTIONS:
-- 1. Soft-delete all 'scheduled' and 'drafted' replies for reviews
--    older than 2026-01-01 (prevents 28,740 old replies from sending)
-- 2. Mark those old reviews as is_answered=true → segment='archived'
-- ============================================================

-- Step 1: Cancel all pending replies for old reviews (CRITICAL - prevents auto-publish)
UPDATE replies
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND status IN ('scheduled', 'drafted')
  AND review_id IN (
    SELECT id FROM reviews
    WHERE review_date < '2026-01-01T00:00:00Z'
      AND deleted_at IS NULL
  );

-- Step 2: Archive all old unanswered/pending reviews (mark as answered)
UPDATE reviews
SET
  is_answered = true,
  segment = 'archived'
WHERE deleted_at IS NULL
  AND review_date < '2026-01-01T00:00:00Z'
  AND segment IN ('unanswered', 'pending');
