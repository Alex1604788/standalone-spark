-- Применение миграции для настройки cron job синхронизации OZON
-- VERSION: 2026-01-15-v1
-- Запустите этот скрипт в Supabase SQL Editor

-- Удаляем старые cron jobs если есть
DO $$
BEGIN
  -- Старый job с неправильным URL
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-marketplaces') THEN
    PERFORM cron.unschedule('sync-ozon-marketplaces');
    RAISE NOTICE 'Removed old sync-ozon-marketplaces job';
  END IF;

  -- Удаляем дубликаты если есть
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-reviews-questions') THEN
    PERFORM cron.unschedule('sync-ozon-reviews-questions');
    RAISE NOTICE 'Removed existing sync-ozon-reviews-questions job';
  END IF;
END $$;

-- Создаем новый cron job для синхронизации отзывов и вопросов
-- Запускается каждые 2 часа (как было изначально в миграции 20251023135010)
SELECT cron.schedule(
  'sync-ozon-reviews-questions',
  '0 */2 * * *', -- Каждые 2 часа
  $$
  DO $BODY$
  DECLARE
    marketplace_record RECORD;
    request_body jsonb;
  BEGIN
    RAISE NOTICE '[CRON] Starting OZON reviews/questions sync';

    -- Для каждого активного OZON маркетплейса с режимом 'api'
    FOR marketplace_record IN
      SELECT
        m.id,
        m.service_account_email as client_id,
        m.api_key_encrypted as api_key,
        m.user_id
      FROM marketplaces m
      WHERE m.type = 'ozon'
        AND m.is_active = true
        AND m.sync_mode = 'api'
        AND m.service_account_email IS NOT NULL
        AND m.api_key_encrypted IS NOT NULL
    LOOP
      RAISE NOTICE '[CRON] Syncing marketplace: %', marketplace_record.id;

      -- Формируем тело запроса
      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.id,
        'user_id', marketplace_record.user_id,
        'clientId', marketplace_record.client_id,
        'apiKey', marketplace_record.api_key
      );

      -- Вызываем Edge Function для синхронизации
      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ'
        ),
        body := request_body
      );

      -- Небольшая пауза между маркетплейсами (избегаем rate limiting)
      PERFORM pg_sleep(3);
    END LOOP;

    RAISE NOTICE '[CRON] OZON sync completed';
  END $BODY$;
  $$
);

-- Проверяем что cron job создан
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname = 'sync-ozon-reviews-questions';
