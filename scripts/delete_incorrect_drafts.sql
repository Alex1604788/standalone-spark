-- Delete incorrectly created drafted replies (created with wrong settings)
-- These were created when reviews_mode was 'semi' instead of 'auto' for 4-5 stars

UPDATE replies
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'drafted'
  AND deleted_at IS NULL
  AND created_at > NOW() - INTERVAL '1 hour';  -- Only recent drafts

-- Check how many will be deleted
SELECT COUNT(*) as drafted_to_delete
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'drafted'
  AND deleted_at IS NULL
  AND created_at > NOW() - INTERVAL '1 hour';
