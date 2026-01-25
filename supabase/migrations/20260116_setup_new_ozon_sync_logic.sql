-- Настройка новой логики синхронизации OZON
-- VERSION: 2026-01-16-v1
--
-- Изменения:
-- 1. Инкрементальная синхронизация каждые 10 минут (отзывы, вопросы, чаты за 2 дня)
-- 2. Полная синхронизация раз в неделю (отзывы, вопросы, чаты за 14 дней)

-- Удаляем старые cron jobs
DO $$
BEGIN
  -- Старый job с 2-часовым интервалом
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-marketplaces') THEN
    PERFORM cron.unschedule('sync-ozon-marketplaces');
    RAISE NOTICE 'Removed old sync-ozon-marketplaces job';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-reviews-questions') THEN
    PERFORM cron.unschedule('sync-ozon-reviews-questions');
    RAISE NOTICE 'Removed old sync-ozon-reviews-questions job';
  END IF;

  -- Удаляем новые если уже существуют
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-incremental') THEN
    PERFORM cron.unschedule('sync-ozon-incremental');
    RAISE NOTICE 'Removed existing sync-ozon-incremental job';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-weekly') THEN
    PERFORM cron.unschedule('sync-ozon-weekly');
    RAISE NOTICE 'Removed existing sync-ozon-weekly job';
  END IF;
END $$;

-- ==============================================================================
-- ИНКРЕМЕНТАЛЬНАЯ СИНХРОНИЗАЦИЯ: Каждые 10 минут (отзывы, вопросы, чаты за 2 дня)
-- ==============================================================================
SELECT cron.schedule(
  'sync-ozon-incremental',
  '*/10 * * * *', -- Каждые 10 минут
  $$
  DO $BODY$
  DECLARE
    marketplace_record RECORD;
    request_body jsonb;
  BEGIN
    RAISE NOTICE '[CRON INCREMENTAL] Starting OZON sync (2 days back)';

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
      RAISE NOTICE '[CRON INCREMENTAL] Syncing marketplace: %', marketplace_record.id;

      -- 1. Синхронизация отзывов и вопросов за последние 2 дня
      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.id,
        'user_id', marketplace_record.user_id,
        'clientId', marketplace_record.client_id,
        'apiKey', marketplace_record.api_key,
        'days_back', 2  -- Только за последние 2 дня
      );

      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ'
        ),
        body := request_body
      );

      -- 2. Синхронизация чатов (только активные)
      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.id,
        'user_id', marketplace_record.user_id,
        'client_id', marketplace_record.client_id,
        'api_key', marketplace_record.api_key
      );

      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-chats-api',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ'
        ),
        body := request_body
      );

      -- Пауза между маркетплейсами
      PERFORM pg_sleep(2);
    END LOOP;

    RAISE NOTICE '[CRON INCREMENTAL] OZON incremental sync completed';
  END $BODY$;
  $$
);

-- ==============================================================================
-- ПОЛНАЯ СИНХРОНИЗАЦИЯ: Раз в неделю (отзывы, вопросы, чаты за 14 дней)
-- ==============================================================================
SELECT cron.schedule(
  'sync-ozon-weekly',
  '0 3 * * 0', -- Каждое воскресенье в 03:00 UTC
  $$
  DO $BODY$
  DECLARE
    marketplace_record RECORD;
    request_body jsonb;
  BEGIN
    RAISE NOTICE '[CRON WEEKLY] Starting OZON full sync (14 days back)';

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
      RAISE NOTICE '[CRON WEEKLY] Syncing marketplace: %', marketplace_record.id;

      -- 1. Синхронизация отзывов и вопросов за последние 14 дней
      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.id,
        'user_id', marketplace_record.user_id,
        'clientId', marketplace_record.client_id,
        'apiKey', marketplace_record.api_key,
        'days_back', 14  -- За последние 14 дней
      );

      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ'
        ),
        body := request_body
      );

      -- 2. Синхронизация чатов (только активные)
      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.id,
        'user_id', marketplace_record.user_id,
        'client_id', marketplace_record.client_id,
        'api_key', marketplace_record.api_key
      );

      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-chats-api',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ'
        ),
        body := request_body
      );

      -- Пауза между маркетплейсами
      PERFORM pg_sleep(3);
    END LOOP;

    RAISE NOTICE '[CRON WEEKLY] OZON weekly sync completed';
  END $BODY$;
  $$
);

-- Проверяем что cron jobs созданы
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname IN ('sync-ozon-incremental', 'sync-ozon-weekly')
ORDER BY jobname;
