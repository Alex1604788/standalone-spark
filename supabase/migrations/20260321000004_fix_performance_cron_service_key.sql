-- =====================================================
-- FIX: trigger_ozon_performance_sync — service_role_key
-- Date: 2026-03-21
-- Проблема: current_setting('app.settings.service_role_key') возвращал NULL
--           → cron тихо завершался без HTTP-запроса → данные не синкались
-- Решение: хардкодим fallback для этого проекта + устанавливаем setting
-- =====================================================

-- Устанавливаем настройки на уровне базы данных
ALTER DATABASE postgres SET "app.settings.supabase_url"      = 'https://bkmicyguzlwampuindff.supabase.co';
ALTER DATABASE postgres SET "app.settings.service_role_key"  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

-- Обновляем trigger_ozon_performance_sync с явным fallback
CREATE OR REPLACE FUNCTION public.trigger_ozon_performance_sync(
  p_marketplace_id UUID,
  p_sync_period TEXT DEFAULT 'daily'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url        TEXT;
  v_service_key TEXT;
  v_request_id  BIGINT;
BEGIN
  v_url         := COALESCE(
    current_setting('app.settings.supabase_url', true),
    'https://bkmicyguzlwampuindff.supabase.co'
  );
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk'
  );

  SELECT net.http_post(
    url     := v_url || '/functions/v1/sync-ozon-performance',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object(
      'marketplace_id', p_marketplace_id::text,
      'sync_period',    p_sync_period
    )
  ) INTO v_request_id;

  RAISE NOTICE 'Triggered sync-ozon-performance for marketplace % (period: %, request_id: %)',
    p_marketplace_id, p_sync_period, v_request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger sync-ozon-performance for %: %', p_marketplace_id, SQLERRM;
END;
$$;

-- Аналогичный фикс для общей функции trigger_ozon_sync (reviews/questions/chats)
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
  v_url         TEXT;
  v_service_key TEXT;
BEGIN
  v_url         := COALESCE(
    current_setting('app.settings.supabase_url', true),
    'https://bkmicyguzlwampuindff.supabase.co'
  );
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk'
  );

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object(
      'marketplace_id', p_marketplace_id::text,
      'client_id',      p_client_id,
      'api_key',        p_api_key
    )
  );
END;
$$;

-- Функция-триггер для sync-ozon-finance
CREATE OR REPLACE FUNCTION public.trigger_ozon_finance_sync(
  p_marketplace_id UUID,
  p_days INT DEFAULT 7
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url         TEXT;
  v_service_key TEXT;
  v_request_id  BIGINT;
BEGIN
  v_url         := COALESCE(
    current_setting('app.settings.supabase_url', true),
    'https://bkmicyguzlwampuindff.supabase.co'
  );
  v_service_key := COALESCE(
    current_setting('app.settings.service_role_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk'
  );

  SELECT net.http_post(
    url     := v_url || '/functions/v1/sync-ozon-finance',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object(
      'marketplace_id', p_marketplace_id::text,
      'days',           p_days
    )
  ) INTO v_request_id;

  RAISE NOTICE 'Triggered sync-ozon-finance for marketplace % (days: %, request_id: %)',
    p_marketplace_id, p_days, v_request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger sync-ozon-finance for %: %', p_marketplace_id, SQLERRM;
END;
$$;

-- Добавляем cron для sync-ozon-finance (ежедневно в 05:00 UTC)
DO $$
BEGIN
  -- Удаляем старый если есть
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-finance-daily-sync') THEN
    PERFORM cron.unschedule('ozon-finance-daily-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'ozon-finance-daily-sync',
  '0 5 * * *',  -- Каждый день в 05:00 UTC (после analytics sync в 03:00)
  $$
  SELECT public.trigger_ozon_finance_sync(mac.marketplace_id)
  FROM marketplace_api_credentials mac
  JOIN marketplaces m ON m.id = mac.marketplace_id
  WHERE mac.api_type = 'seller'
    AND mac.is_active = true
    AND m.is_active = true
    AND mac.api_key_encrypted IS NOT NULL;
  $$
);

GRANT EXECUTE ON FUNCTION public.trigger_ozon_performance_sync TO postgres;
GRANT EXECUTE ON FUNCTION public.trigger_ozon_sync TO postgres;
