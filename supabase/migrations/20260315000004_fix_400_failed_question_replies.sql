-- Migration: Fix question replies stuck in 'failed' due to 400 (OZON API rejected)
-- These questions show "Ошибка" forever because retry_count=5 (max), no more retries.
-- 400 = Bad Request — question likely deleted/closed by buyer or expired.
-- Fix: soft-delete the reply + set is_answered=true → question moves to 'archived'.

-- Step 1: Find and soft-delete question replies with 400 errors at max retry
UPDATE replies
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND status = 'failed'
  AND question_id IS NOT NULL
  AND error_message LIKE '%400%'
  AND retry_count >= 5;

-- Step 2: Archive questions whose only non-deleted replies are now deleted (all were 400)
UPDATE questions q
SET is_answered = true
WHERE deleted_at IS NULL
  AND is_answered = false
  AND NOT EXISTS (
    SELECT 1 FROM replies rep
    WHERE rep.question_id = q.id
      AND rep.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM replies rep
    WHERE rep.question_id = q.id
      AND rep.deleted_at IS NOT NULL
      AND rep.error_message LIKE '%400%'
  );

-- Verify
DO $$
DECLARE
  v_failed_400 INT;
  v_archived INT;
BEGIN
  SELECT COUNT(*) INTO v_failed_400
  FROM replies WHERE status = 'failed' AND question_id IS NOT NULL AND error_message LIKE '%400%' AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_archived
  FROM questions q
  WHERE q.deleted_at IS NULL
    AND q.is_answered = true
    AND NOT EXISTS (
      SELECT 1 FROM replies rep
      WHERE rep.question_id = q.id AND rep.deleted_at IS NULL
    );

  RAISE NOTICE 'After fix — remaining active failed-400 question replies: %, archived questions: %',
    v_failed_400, v_archived;
END $$;
