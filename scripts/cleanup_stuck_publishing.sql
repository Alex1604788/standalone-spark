-- Cleanup replies stuck in "publishing" status
-- These replies have been in "publishing" for more than 5 minutes

-- VERSION: 2026-01-15-v1 - Reset stuck publishing replies back to scheduled

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_stuck_count INT;
BEGIN
  RAISE NOTICE 'Looking for replies stuck in publishing status...';

  -- Find replies that have been "publishing" for more than 5 minutes
  -- Reset them back to "scheduled" so they can be retried
  UPDATE replies
  SET
    status = 'scheduled',
    scheduled_at = NOW() + INTERVAL '1 minute',  -- Retry in 1 minute
    error_message = 'Reset from stuck publishing status',
    retry_count = COALESCE(retry_count, 0) + 1,
    updated_at = NOW()
  WHERE marketplace_id = v_marketplace_id
    AND status = 'publishing'
    AND deleted_at IS NULL
    AND updated_at < NOW() - INTERVAL '5 minutes';  -- Stuck for 5+ minutes

  GET DIAGNOSTICS v_stuck_count = ROW_COUNT;
  RAISE NOTICE 'Reset % replies from publishing to scheduled', v_stuck_count;

  -- Also check for replies that failed too many times
  UPDATE replies
  SET
    status = 'failed',
    error_message = 'Max retries exceeded',
    updated_at = NOW()
  WHERE marketplace_id = v_marketplace_id
    AND status = 'scheduled'
    AND deleted_at IS NULL
    AND retry_count >= 5;

  GET DIAGNOSTICS v_stuck_count = ROW_COUNT;
  RAISE NOTICE 'Marked % replies as failed (max retries)', v_stuck_count;
END $$;

-- Show current status distribution
SELECT
  status,
  COUNT(*) as count,
  MIN(updated_at) as oldest,
  MAX(updated_at) as newest
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
