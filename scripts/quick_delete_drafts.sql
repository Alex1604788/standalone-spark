-- Quick delete of drafted replies with triggers disabled
-- Run this in Supabase SQL Editor

-- Disable triggers temporarily
ALTER TABLE replies DISABLE TRIGGER ALL;

-- Delete drafted replies
UPDATE replies
SET deleted_at = NOW()
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'drafted'
  AND deleted_at IS NULL;

-- Re-enable triggers
ALTER TABLE replies ENABLE TRIGGER ALL;

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
