-- Delete old drafted and failed replies - SIMPLE VERSION for small record count
-- VERSION: 2026-01-15-v1 - Direct update without batching

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_drafted_count INT;
  v_failed_count INT;
BEGIN
  RAISE NOTICE '=== Starting simple cleanup ===';

  -- Count drafted before deletion
  SELECT COUNT(*) INTO v_drafted_count
  FROM replies
  WHERE marketplace_id = v_marketplace_id
    AND status = 'drafted'
    AND deleted_at IS NULL;

  RAISE NOTICE 'Found % drafted replies to delete', v_drafted_count;

  -- Count failed before deletion
  SELECT COUNT(*) INTO v_failed_count
  FROM replies
  WHERE marketplace_id = v_marketplace_id
    AND status = 'failed'
    AND deleted_at IS NULL;

  RAISE NOTICE 'Found % failed replies to delete', v_failed_count;

  -- Soft delete all drafted replies
  UPDATE replies
  SET deleted_at = NOW()
  WHERE marketplace_id = v_marketplace_id
    AND status = 'drafted'
    AND deleted_at IS NULL;

  RAISE NOTICE '✅ Deleted % drafted replies', v_drafted_count;

  -- Soft delete all failed replies
  UPDATE replies
  SET deleted_at = NOW()
  WHERE marketplace_id = v_marketplace_id
    AND status = 'failed'
    AND deleted_at IS NULL;

  RAISE NOTICE '✅ Deleted % failed replies', v_failed_count;

  RAISE NOTICE '=== Cleanup complete! Total deleted: % ===', v_drafted_count + v_failed_count;
END $$;

-- Verify deletion
SELECT
  'After cleanup' as status,
  status,
  COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
