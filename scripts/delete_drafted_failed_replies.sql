-- Delete old drafted and failed replies that clog the database
-- VERSION: 2026-01-15-v2

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_drafted_count INT;
  v_failed_count INT;
BEGIN
  RAISE NOTICE '=== Cleaning up old replies ===';

  -- Soft delete all drafted replies (shouldn't exist for auto mode)
  UPDATE replies
  SET deleted_at = NOW()
  WHERE marketplace_id = v_marketplace_id
    AND status = 'drafted'
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_drafted_count = ROW_COUNT;
  RAISE NOTICE '✅ Soft-deleted % drafted replies', v_drafted_count;

  -- Soft delete all failed replies (will be recreated)
  UPDATE replies
  SET deleted_at = NOW()
  WHERE marketplace_id = v_marketplace_id
    AND status = 'failed'
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_failed_count = ROW_COUNT;
  RAISE NOTICE '✅ Soft-deleted % failed replies', v_failed_count;

  RAISE NOTICE '=== Cleanup complete ===';
END $$;

-- Show current status distribution
SELECT
  status,
  COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
