-- =====================================================
-- Migration: Prevent duplicate replies (100% protection)
-- Date: 2025-01-26
-- Description: Creates unique constraints to physically 
--              prevent duplicate replies for reviews/questions
-- =====================================================

-- =====================================================
-- STEP 1: Cleanup existing duplicates (if any)
-- =====================================================

-- For reviews: Keep only the oldest reply, mark rest as failed
WITH review_duplicates AS (
  SELECT 
    id, 
    review_id,
    ROW_NUMBER() OVER (
      PARTITION BY review_id 
      ORDER BY created_at ASC
    ) as row_num
  FROM replies
  WHERE review_id IS NOT NULL
    AND status IN ('scheduled', 'publishing', 'published')
)
UPDATE replies
SET 
  status = 'failed',
  error_message = 'DUPLICATE_CLEANUP_MIGRATION',
  updated_at = NOW()
WHERE id IN (
  SELECT id 
  FROM review_duplicates 
  WHERE row_num > 1
);

-- For questions: Keep only the oldest reply, mark rest as failed
WITH question_duplicates AS (
  SELECT 
    id, 
    question_id,
    ROW_NUMBER() OVER (
      PARTITION BY question_id 
      ORDER BY created_at ASC
    ) as row_num
  FROM replies
  WHERE question_id IS NOT NULL
    AND status IN ('scheduled', 'publishing', 'published')
)
UPDATE replies
SET 
  status = 'failed',
  error_message = 'DUPLICATE_CLEANUP_MIGRATION',
  updated_at = NOW()
WHERE id IN (
  SELECT id 
  FROM question_duplicates 
  WHERE row_num > 1
);

-- =====================================================
-- STEP 2: Create unique indexes (MAIN PROTECTION)
-- =====================================================

-- Prevent multiple active replies for the same review
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_review_reply
ON replies (review_id)
WHERE review_id IS NOT NULL 
  AND status IN ('scheduled', 'publishing', 'published');

-- Prevent multiple active replies for the same question
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_question_reply
ON replies (question_id)
WHERE question_id IS NOT NULL 
  AND status IN ('scheduled', 'publishing', 'published');

-- =====================================================
-- STEP 3: Create performance indexes
-- =====================================================

-- Speed up queries for scheduled replies
CREATE INDEX IF NOT EXISTS idx_replies_marketplace_scheduled
ON replies (marketplace_id, status, created_at)
WHERE status = 'scheduled';

-- Speed up queries for publishing replies (cleanup)
CREATE INDEX IF NOT EXISTS idx_replies_marketplace_publishing
ON replies (marketplace_id, status, updated_at)
WHERE status = 'publishing';

-- Speed up queries for checking existing replies
CREATE INDEX IF NOT EXISTS idx_replies_review_status
ON replies (review_id, status)
WHERE review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_replies_question_status
ON replies (question_id, status)
WHERE question_id IS NOT NULL;

-- =====================================================
-- STEP 4: Create atomic locking function (OPTIONAL)
-- =====================================================

-- This function provides atomic row locking using FOR UPDATE SKIP LOCKED
-- It ensures only ONE process can take a specific reply
CREATE OR REPLACE FUNCTION lock_and_get_pending_replies(
  p_marketplace_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  review_id UUID,
  question_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH locked_rows AS (
    -- Select and lock rows atomically
    SELECT r.id
    FROM replies r
    WHERE r.marketplace_id = p_marketplace_id
      AND r.status = 'scheduled'
    ORDER BY r.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED  -- Skip rows locked by other processes
  ),
  updated_rows AS (
    -- Update status to 'publishing' for locked rows
    UPDATE replies r
    SET 
      status = 'publishing',
      updated_at = NOW()
    FROM locked_rows lr
    WHERE r.id = lr.id
      AND r.status = 'scheduled'  -- Double-check status hasn't changed
    RETURNING r.id, r.content, r.review_id, r.question_id, r.created_at
  )
  SELECT * FROM updated_rows;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION lock_and_get_pending_replies TO service_role;

-- Grant execute permission to authenticated users (if needed)
GRANT EXECUTE ON FUNCTION lock_and_get_pending_replies TO authenticated;

-- =====================================================
-- VERIFICATION QUERIES (run these to check)
-- =====================================================

-- Check for any remaining duplicates (should return 0 rows)
-- SELECT review_id, COUNT(*) as count
-- FROM replies
-- WHERE review_id IS NOT NULL 
--   AND status IN ('scheduled', 'publishing', 'published')
-- GROUP BY review_id
-- HAVING COUNT(*) > 1;

-- Check for any remaining duplicates in questions (should return 0 rows)
-- SELECT question_id, COUNT(*) as count
-- FROM replies
-- WHERE question_id IS NOT NULL 
--   AND status IN ('scheduled', 'publishing', 'published')
-- GROUP BY question_id
-- HAVING COUNT(*) > 1;

-- =====================================================
-- NOTES
-- =====================================================

-- After this migration:
-- 1. It will be PHYSICALLY IMPOSSIBLE to create duplicate replies
-- 2. Database will return error code 23505 on duplicate attempts
-- 3. Application code should handle this error gracefully
-- 4. The lock_and_get_pending_replies function provides atomic locking

-- To test unique constraint:
-- INSERT INTO replies (review_id, content, status, marketplace_id, user_id)
-- VALUES ('existing-review-id', 'Test', 'scheduled', 'marketplace-id', 'user-id');
-- Second insert with same review_id should fail with:
-- ERROR: duplicate key value violates unique constraint "idx_unique_active_review_reply"
