-- Enable OZON API mode for automatic publishing
-- VERSION: 2026-01-15-v1
-- This script switches marketplace from plugin mode to API mode

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_current_mode TEXT;
BEGIN
  -- Check current sync_mode
  SELECT sync_mode INTO v_current_mode
  FROM marketplaces
  WHERE id = v_marketplace_id;

  RAISE NOTICE 'Current sync_mode: %', COALESCE(v_current_mode, 'NULL (not set)');

  -- Update to API mode
  UPDATE marketplaces
  SET
    sync_mode = 'api',
    sync_reviews = true,
    updated_at = NOW()
  WHERE id = v_marketplace_id;

  RAISE NOTICE '✅ Updated sync_mode to: api';
  RAISE NOTICE '✅ Enabled sync_reviews';

  -- Verify
  SELECT sync_mode INTO v_current_mode
  FROM marketplaces
  WHERE id = v_marketplace_id;

  RAISE NOTICE 'New sync_mode: %', v_current_mode;
END $$;

-- Show updated marketplace settings
SELECT
  id,
  name,
  type,
  sync_mode,
  sync_reviews,
  is_active
FROM marketplaces
WHERE id = '84b1d0f5-6750-407c-9b04-28c051972162';
