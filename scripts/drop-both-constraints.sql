-- Drop both unique constraints (reviews and questions)
DROP INDEX IF EXISTS idx_unique_active_review_reply;
DROP INDEX IF EXISTS idx_unique_active_question_reply;

-- Now reset ALL stuck replies (both reviews and questions)
UPDATE replies
SET status = 'scheduled', retry_count = 0, error_message = NULL, scheduled_at = NOW(), updated_at = NOW()
WHERE status IN ('publishing', 'failed')
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL;

-- Check results
SELECT
  CASE
    WHEN review_id IS NOT NULL THEN 'review'
    WHEN question_id IS NOT NULL THEN 'question'
    ELSE 'unknown'
  END as reply_type,
  status,
  COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY reply_type, status
ORDER BY reply_type, status;
