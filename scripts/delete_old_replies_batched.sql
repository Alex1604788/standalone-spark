-- Delete old drafted and failed replies in BATCHES to avoid timeout
-- VERSION: 2026-01-15-v3 - Batch delete to avoid timeout

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_batch_size INT := 5000;
  v_total_drafted INT := 0;
  v_total_failed INT := 0;
  v_deleted INT;
BEGIN
  RAISE NOTICE '=== Starting batch cleanup ===';

  -- Delete drafted replies in batches
  LOOP
    UPDATE replies
    SET deleted_at = NOW()
    WHERE id IN (
      SELECT id
      FROM replies
      WHERE marketplace_id = v_marketplace_id
        AND status = 'drafted'
        AND deleted_at IS NULL
      LIMIT v_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    EXIT WHEN v_deleted = 0;

    v_total_drafted := v_total_drafted + v_deleted;
    RAISE NOTICE 'Deleted % drafted (total: %)', v_deleted, v_total_drafted;

    -- Small delay to avoid overwhelming database
    PERFORM pg_sleep(0.5);
  END LOOP;

  RAISE NOTICE '✅ Total drafted deleted: %', v_total_drafted;

  -- Delete failed replies in batches
  LOOP
    UPDATE replies
    SET deleted_at = NOW()
    WHERE id IN (
      SELECT id
      FROM replies
      WHERE marketplace_id = v_marketplace_id
        AND status = 'failed'
        AND deleted_at IS NULL
      LIMIT v_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    EXIT WHEN v_deleted = 0;

    v_total_failed := v_total_failed + v_deleted;
    RAISE NOTICE 'Deleted % failed (total: %)', v_deleted, v_total_failed;

    PERFORM pg_sleep(0.5);
  END LOOP;

  RAISE NOTICE '✅ Total failed deleted: %', v_total_failed;
  RAISE NOTICE '=== Cleanup complete ===';
END $$;
