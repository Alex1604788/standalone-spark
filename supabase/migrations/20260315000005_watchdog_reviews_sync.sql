-- Migration: Watchdog for reviews sync
-- The pg_cron job for reviews sync occasionally stops (Supabase infrastructure issue).
-- This watchdog runs every 5 minutes and triggers a manual sync if last sync was >15 min ago.

-- Function: check if reviews sync is stale and trigger if needed
CREATE OR REPLACE FUNCTION public.watchdog_reviews_sync()
RETURNS void AS $$
DECLARE
  v_last_sync TIMESTAMPTZ;
  v_threshold INTERVAL := INTERVAL '15 minutes';
BEGIN
  -- Check when the marketplace cursor was last updated (proxy for last successful sync)
  SELECT MAX(updated_at) INTO v_last_sync
  FROM public.marketplaces
  WHERE type = 'ozon' AND sync_mode = 'api' AND deleted_at IS NULL;

  IF v_last_sync IS NULL OR v_last_sync < NOW() - v_threshold THEN
    RAISE LOG 'watchdog_reviews_sync: sync is stale (last_sync=%), triggering manual run', v_last_sync;
    PERFORM public.trigger_ozon_sync(
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
    RAISE LOG 'watchdog_reviews_sync: triggered sync for stale marketplace';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule watchdog every 5 minutes
SELECT cron.schedule(
  'watchdog-reviews-sync',
  '*/5 * * * *',
  $$SELECT public.watchdog_reviews_sync();$$
);
