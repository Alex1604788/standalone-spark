-- Check OZON API setup for marketplace
-- Verify that sync_mode and credentials are properly configured

-- VERSION: 2026-01-15-v1 - Diagnostic for OZON API publishing issues

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162';
  v_sync_mode TEXT;
  v_creds_count INT;
BEGIN
  -- Check sync mode
  SELECT get_marketplace_sync_mode(v_marketplace_id) INTO v_sync_mode;
  RAISE NOTICE 'Sync mode: %', COALESCE(v_sync_mode, 'NULL (not set)');

  -- Check API credentials
  SELECT COUNT(*) INTO v_creds_count
  FROM get_api_credentials(v_marketplace_id, 'seller');
  RAISE NOTICE 'API credentials count: %', v_creds_count;

  -- If sync_mode is NULL or credentials missing, show warning
  IF v_sync_mode IS NULL OR v_sync_mode = 'plugin' THEN
    RAISE WARNING 'Marketplace is using PLUGIN mode - replies will NOT be published via API!';
    RAISE WARNING 'To enable API publishing, set sync_mode to ''api'' in marketplaces table';
  ELSIF v_creds_count = 0 THEN
    RAISE WARNING 'API mode enabled but NO CREDENTIALS found!';
    RAISE WARNING 'Add OZON API credentials to marketplace_api_credentials table';
  ELSE
    RAISE NOTICE '✅ API mode enabled and credentials found - publishing should work';
  END IF;
END $$;

-- Show marketplace details
SELECT
  id,
  name,
  type,
  sync_mode,
  is_active,
  last_sync_at
FROM marketplaces
WHERE id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- Show API credentials (without exposing secrets)
SELECT
  id,
  marketplace_id,
  api_type,
  client_id,
  LENGTH(client_secret) as secret_length,
  is_active,
  created_at,
  updated_at
FROM marketplace_api_credentials
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- Show stuck replies
SELECT
  id,
  status,
  review_id,
  error_message,
  retry_count,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_stuck
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'publishing'
  AND deleted_at IS NULL
ORDER BY updated_at
LIMIT 10;
