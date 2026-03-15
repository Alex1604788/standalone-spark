-- Migration: Soft-delete reviews and replies from before 2025
-- Confirmed by user: 2023 and 2024 reviews not needed
-- DB has: 5,074 reviews from 2023 (0 from 2024)
-- 2023 breakdown: archived: 2,052 (with replies), pending: 688 (with replies), unanswered: 2,334

-- Step 1: Soft-delete replies for pre-2025 reviews FIRST
-- (so segment trigger fires while review still exists but is harmless —
--  reviews will be deleted immediately after)
UPDATE replies
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND review_id IN (
    SELECT id FROM reviews
    WHERE review_date < '2025-01-01'
      AND deleted_at IS NULL
  );

-- Step 2: Soft-delete pre-2025 reviews
UPDATE reviews
SET deleted_at = NOW()
WHERE review_date < '2025-01-01'
  AND deleted_at IS NULL;

-- Verify
DO $$
DECLARE
  v_reviews INT;
  v_replies INT;
BEGIN
  SELECT COUNT(*) INTO v_reviews FROM reviews WHERE review_date < '2025-01-01' AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_replies FROM replies rep
    JOIN reviews r ON r.id = rep.review_id
    WHERE r.review_date < '2025-01-01' AND rep.deleted_at IS NULL;
  RAISE NOTICE 'After cleanup — active pre-2025 reviews: %, active replies on pre-2025 reviews: %', v_reviews, v_replies;
END $$;
