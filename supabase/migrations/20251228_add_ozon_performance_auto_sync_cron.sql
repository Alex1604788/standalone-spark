-- Автоматическая синхронизация OZON Performance данных
-- Ежедневная синхронизация за 7 дней: каждый день в 03:00 UTC
-- Еженедельная полная синхронизация за 62 дня: каждое воскресенье в 04:00 UTC

-- Удаляем существующие cron jobs, если есть
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-daily-sync') THEN
    PERFORM cron.unschedule('ozon-performance-daily-sync');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-weekly-sync') THEN
    PERFORM cron.unschedule('ozon-performance-weekly-sync');
  END IF;
END $$;

-- Ежедневная синхронизация за последние 7 дней (каждый день в 03:00 UTC)
SELECT cron.schedule(
  'ozon-performance-daily-sync',
  '0 3 * * *', -- Каждый день в 03:00 UTC
  $$
  DO $$
  DECLARE
    marketplace_record RECORD;
    request_body jsonb;
    end_date text;
    start_date text;
  BEGIN
    -- Получаем текущую дату для синхронизации
    end_date := to_char(CURRENT_DATE, 'YYYY-MM-DD');
    start_date := to_char(CURRENT_DATE - interval '7 days', 'YYYY-MM-DD');

    -- Для каждого маркетплейса с включенной автосинхронизацией
    FOR marketplace_record IN
      SELECT DISTINCT mac.marketplace_id
      FROM marketplace_api_credentials mac
      WHERE mac.api_type = 'performance'
        AND mac.auto_sync_enabled = true
        AND mac.client_id IS NOT NULL
        AND mac.client_secret IS NOT NULL
    LOOP
      -- Формируем тело запроса для синхронизации за 7 дней
      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.marketplace_id,
        'start_date', start_date,
        'end_date', end_date
      );

      -- Вызываем Edge Function для синхронизации
      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon-performance',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ"}'::jsonb,
        body := request_body
      );

      -- Небольшая пауза между маркетплейсами
      PERFORM pg_sleep(2);
    END LOOP;
  END $$;
  $$
);

-- Еженедельная полная синхронизация за 62 дня (каждое воскресенье в 04:00 UTC)
SELECT cron.schedule(
  'ozon-performance-weekly-sync',
  '0 4 * * 0', -- Каждое воскресенье в 04:00 UTC
  $$
  DO $$
  DECLARE
    marketplace_record RECORD;
    request_body jsonb;
  BEGIN
    -- Для каждого маркетплейса с включенной автосинхронизацией
    FOR marketplace_record IN
      SELECT DISTINCT mac.marketplace_id
      FROM marketplace_api_credentials mac
      WHERE mac.api_type = 'performance'
        AND mac.auto_sync_enabled = true
        AND mac.client_id IS NOT NULL
        AND mac.client_secret IS NOT NULL
    LOOP
      -- Формируем тело запроса для полной синхронизации (62 дня)
      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.marketplace_id,
        'sync_period', 'weekly'
      );

      -- Вызываем Edge Function для синхронизации
      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon-performance',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ"}'::jsonb,
        body := request_body
      );

      -- Небольшая пауза между маркетплейсами
      PERFORM pg_sleep(2);
    END LOOP;
  END $$;
  $$
);
