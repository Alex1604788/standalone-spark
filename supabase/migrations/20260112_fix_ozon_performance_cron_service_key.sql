-- Исправление CRON jobs: использовать service_role key вместо anon key
-- Date: 2026-01-12
-- Проблема: старые CRON jobs используют anon key, который не имеет прав на вызов Edge Functions
-- Решение: заменить на service_role key и использовать переменные окружения

-- Удаляем существующие cron jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-daily-sync') THEN
    PERFORM cron.unschedule('ozon-performance-daily-sync');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-weekly-sync') THEN
    PERFORM cron.unschedule('ozon-performance-weekly-sync');
  END IF;
END $$;

-- Создаём функцию для вызова sync-ozon-performance с правильным токеном
CREATE OR REPLACE FUNCTION public.trigger_ozon_performance_sync(
  p_marketplace_id UUID,
  p_sync_period TEXT DEFAULT 'daily'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
  v_request_id bigint;
BEGIN
  -- Используем Supabase URL и Service Role Key из переменных окружения
  -- В Supabase эти значения нужно настроить в Dashboard → Settings → Vault
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Если переменные не настроены, используем хардкод для этого проекта
  IF v_url IS NULL THEN
    v_url := 'https://bkmicyguzlwampuindff.supabase.co';
  END IF;

  IF v_service_key IS NULL THEN
    -- Service role key будет настроен через Vault
    RAISE NOTICE 'Service role key not configured in app.settings.service_role_key';
    RETURN;
  END IF;

  -- Вызываем Edge Function через pg_net
  SELECT net.http_post(
    url := v_url || '/functions/v1/sync-ozon-performance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'marketplace_id', p_marketplace_id::text,
      'sync_period', p_sync_period
    )
  ) INTO v_request_id;

  RAISE NOTICE 'Triggered sync for marketplace % (sync_period: %, request_id: %)',
    p_marketplace_id, p_sync_period, v_request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger sync for marketplace %: %', p_marketplace_id, SQLERRM;
END;
$$;

-- Ежедневная синхронизация за последние 7 дней (каждый день в 03:00 UTC)
SELECT cron.schedule(
  'ozon-performance-daily-sync',
  '0 3 * * *', -- Каждый день в 03:00 UTC
  $$
  SELECT public.trigger_ozon_performance_sync(
    mac.marketplace_id,
    'daily'
  )
  FROM marketplace_api_credentials mac
  WHERE mac.api_type = 'performance'
    AND mac.auto_sync_enabled = true
    AND mac.is_active = true
    AND mac.client_id IS NOT NULL
    AND mac.client_secret IS NOT NULL;
  $$
);

-- Еженедельная полная синхронизация за 62 дня (каждое воскресенье в 04:00 UTC)
SELECT cron.schedule(
  'ozon-performance-weekly-sync',
  '0 4 * * 0', -- Каждое воскресенье в 04:00 UTC
  $$
  SELECT public.trigger_ozon_performance_sync(
    mac.marketplace_id,
    'full'
  )
  FROM marketplace_api_credentials mac
  WHERE mac.api_type = 'performance'
    AND mac.auto_sync_enabled = true
    AND mac.is_active = true
    AND mac.client_id IS NOT NULL
    AND mac.client_secret IS NOT NULL;
  $$
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.trigger_ozon_performance_sync TO postgres;

COMMENT ON FUNCTION public.trigger_ozon_performance_sync IS 'Триггер для автоматической синхронизации OZON Performance через CRON. Использует service_role key из app.settings.service_role_key';
