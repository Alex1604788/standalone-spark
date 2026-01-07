-- =====================================================
-- Setup CRON Jobs for OZON API Auto-Sync
-- Date: 2026-01-07
-- =====================================================
-- NOTE: This migration creates CRON jobs that will automatically
-- sync OZON data every 10 minutes for marketplaces in API mode.
--
-- ⚠️ IMPORTANT: Before running this migration, you need to:
-- 1. Go to Supabase Dashboard → Database → Extensions
-- 2. Enable "pg_cron" extension
-- 3. Enable "pg_net" extension (for HTTP requests)
--
-- After enabling extensions, run this migration via:
-- Supabase Dashboard → SQL Editor → paste and run
-- =====================================================

-- Create helper function to call Edge Functions via pg_net
CREATE OR REPLACE FUNCTION public.trigger_ozon_sync(
  p_function_name TEXT,
  p_marketplace_id UUID,
  p_client_id TEXT,
  p_api_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Get Supabase URL from vault or environment
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, skip (will be set up later)
  IF v_url IS NULL OR v_service_key IS NULL THEN
    RAISE NOTICE 'Supabase URL or Service Role Key not configured. Skipping sync.';
    RETURN;
  END IF;

  -- Call Edge Function via pg_net
  PERFORM net.http_post(
    url := v_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'marketplace_id', p_marketplace_id::text,
      'client_id', p_client_id,
      'api_key', p_api_key
    )
  );
END;
$$;

-- CRON Job #1: Sync OZON Chats every 10 minutes
-- Unschedule first if exists
SELECT cron.unschedule('sync-ozon-chats-every-10min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-chats-every-10min'
);

SELECT cron.schedule(
  'sync-ozon-chats-every-10min',
  '*/10 * * * *', -- Every 10 minutes
  $$
  SELECT public.trigger_ozon_sync(
    'sync-chats-api',
    m.id,
    c.client_id,
    c.client_secret
  )
  FROM public.marketplaces m
  JOIN public.marketplace_api_credentials c ON c.marketplace_id = m.id
  WHERE m.type = 'ozon'
    AND m.sync_mode = 'api'
    AND c.api_type = 'seller'
    AND c.is_active = TRUE;
  $$
);

-- CRON Job #2: Sync OZON Questions every 10 minutes
SELECT cron.unschedule('sync-ozon-questions-every-10min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-questions-every-10min'
);

SELECT cron.schedule(
  'sync-ozon-questions-every-10min',
  '*/10 * * * *',
  $$
  SELECT public.trigger_ozon_sync(
    'sync-questions-api',
    m.id,
    c.client_id,
    c.client_secret
  )
  FROM public.marketplaces m
  JOIN public.marketplace_api_credentials c ON c.marketplace_id = m.id
  WHERE m.type = 'ozon'
    AND m.sync_mode = 'api'
    AND c.api_type = 'seller'
    AND c.is_active = TRUE;
  $$
);

-- CRON Job #3: Sync OZON Reviews every 10 minutes
SELECT cron.unschedule('sync-ozon-reviews-every-10min') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-reviews-every-10min'
);

SELECT cron.schedule(
  'sync-ozon-reviews-every-10min',
  '*/10 * * * *',
  $$
  SELECT public.trigger_ozon_sync(
    'sync-reviews-api',
    m.id,
    c.client_id,
    c.client_secret
  )
  FROM public.marketplaces m
  JOIN public.marketplace_api_credentials c ON c.marketplace_id = m.id
  WHERE m.type = 'ozon'
    AND m.sync_mode = 'api'
    AND c.api_type = 'seller'
    AND c.is_active = TRUE;
  $$
);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.trigger_ozon_sync TO postgres;

-- =====================================================
-- DONE! OZON Auto-Sync CRON Jobs configured
-- =====================================================
-- To view active CRON jobs, run:
-- SELECT * FROM cron.job WHERE jobname LIKE 'sync-ozon%';
--
-- To manually unschedule (if needed):
-- SELECT cron.unschedule('sync-ozon-chats-every-10min');
-- SELECT cron.unschedule('sync-ozon-questions-every-10min');
-- SELECT cron.unschedule('sync-ozon-reviews-every-10min');
-- =====================================================
