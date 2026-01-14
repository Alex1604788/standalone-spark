-- Quick delete of drafted replies with user triggers disabled
-- Run this in Supabase SQL Editor

-- Disable only user triggers (not system FK triggers)
ALTER TABLE replies DISABLE TRIGGER log_replies_changes;
ALTER TABLE replies DISABLE TRIGGER reply_changes_update_review_segment;
ALTER TABLE replies DISABLE TRIGGER trigger_update_review_segment_on_reply_change;
ALTER TABLE replies DISABLE TRIGGER update_review_segment_on_reply_change;
ALTER TABLE replies DISABLE TRIGGER update_replies_updated_at;

-- Delete drafted replies
UPDATE replies
SET deleted_at = NOW()
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'drafted'
  AND deleted_at IS NULL;

-- Re-enable triggers
ALTER TABLE replies ENABLE TRIGGER log_replies_changes;
ALTER TABLE replies ENABLE TRIGGER reply_changes_update_review_segment;
ALTER TABLE replies ENABLE TRIGGER trigger_update_review_segment_on_reply_change;
ALTER TABLE replies ENABLE TRIGGER update_review_segment_on_reply_change;
ALTER TABLE replies ENABLE TRIGGER update_replies_updated_at;

-- Update review segments manually for affected reviews
UPDATE reviews r
SET segment = calculate_review_segment(r.id),
    updated_at = NOW()
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.segment = 'pending';

-- Verify: should show 0 drafted
SELECT COUNT(*) as drafted_count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'drafted'
  AND deleted_at IS NULL;

-- Verify: should show reviews ready for auto-generation
SELECT COUNT(*) as unanswered_count
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND segment = 'unanswered'
  AND rating IN (4, 5);
