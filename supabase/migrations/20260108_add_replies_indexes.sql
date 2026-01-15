-- Add indexes for replies table to fix timeout on publishing status check
-- The updatePublishingStatus function queries replies every 10 seconds

-- Index for scheduled replies count query
CREATE INDEX IF NOT EXISTS idx_replies_marketplace_status
  ON replies(marketplace_id, status)
  WHERE deleted_at IS NULL;

-- Index for review/question replies lookup
CREATE INDEX IF NOT EXISTS idx_replies_review_id
  ON replies(review_id)
  WHERE review_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_replies_question_id
  ON replies(question_id)
  WHERE question_id IS NOT NULL AND deleted_at IS NULL;
