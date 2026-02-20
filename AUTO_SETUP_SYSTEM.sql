-- ============================================================================
-- АВТОМАТИЧЕСКАЯ НАСТРОЙКА ВСЕЙ СИСТЕМЫ
-- Дата: 2026-02-20
-- Проект: КРАФТМАН (standalone-spark)
-- ============================================================================
--
-- ИНСТРУКЦИЯ:
-- 1. Откройте Supabase SQL Editor:
--    https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
-- 2. Скопируйте ВЕСЬ этот файл
-- 3. Вставьте в SQL Editor
-- 4. Нажмите "Run" (F5)
-- 5. Дождитесь завершения (может занять 1-2 минуты)
--
-- ============================================================================

-- ===========================================================================
-- ШАГ 1: ПРОВЕРКА ТЕКУЩЕГО СОСТОЯНИЯ
-- ===========================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'АВТОМАТИЧЕСКАЯ НАСТРОЙКА СИСТЕМЫ';
  RAISE NOTICE 'Дата: %', NOW();
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'ШАГ 1/5: Проверка текущего состояния...';
END $$;

-- Проверяем наличие cron jobs
SELECT
  'ТЕКУЩИЕ CRON JOBS' as info,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname LIKE '%ozon%' OR jobname LIKE '%auto-generate%'
ORDER BY jobname;

-- ===========================================================================
-- ШАГ 2: УДАЛЕНИЕ СТАРЫХ CRON JOBS
-- ===========================================================================

DO $$
BEGIN
  RAISE NOTICE 'ШАГ 2/5: Удаление старых cron jobs...';

  -- Старые jobs
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-marketplaces') THEN
    PERFORM cron.unschedule('sync-ozon-marketplaces');
    RAISE NOTICE '  ✓ Удален: sync-ozon-marketplaces';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-reviews-questions') THEN
    PERFORM cron.unschedule('sync-ozon-reviews-questions');
    RAISE NOTICE '  ✓ Удален: sync-ozon-reviews-questions';
  END IF;

  -- Удаляем новые если существуют (чтобы пересоздать)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-incremental') THEN
    PERFORM cron.unschedule('sync-ozon-incremental');
    RAISE NOTICE '  ✓ Удален: sync-ozon-incremental (для пересоздания)';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ozon-weekly') THEN
    PERFORM cron.unschedule('sync-ozon-weekly');
    RAISE NOTICE '  ✓ Удален: sync-ozon-weekly (для пересоздания)';
  END IF;

  RAISE NOTICE '  ✓ Старые cron jobs удалены';
END $$;

-- ===========================================================================
-- ШАГ 3: СОЗДАНИЕ НОВЫХ CRON JOBS
-- ===========================================================================

DO $$
BEGIN
  RAISE NOTICE 'ШАГ 3/5: Создание новых cron jobs...';
END $$;

-- 3.1: Инкрементальная синхронизация (каждые 10 минут)
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
        'days_back', 2
      );

      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ'
        ),
        body := request_body
      );

      -- 2. Синхронизация чатов
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

      PERFORM pg_sleep(2);
    END LOOP;

    RAISE NOTICE '[CRON INCREMENTAL] OZON incremental sync completed';
  END $BODY$;
  $$
);

DO $$
BEGIN
  RAISE NOTICE '  ✓ Создан: sync-ozon-incremental (каждые 10 минут)';
END $$;

-- 3.2: Полная синхронизация (раз в неделю)
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

      request_body := jsonb_build_object(
        'marketplace_id', marketplace_record.id,
        'user_id', marketplace_record.user_id,
        'clientId', marketplace_record.client_id,
        'apiKey', marketplace_record.api_key,
        'days_back', 14
      );

      PERFORM net.http_post(
        url := 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ'
        ),
        body := request_body
      );

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

      PERFORM pg_sleep(3);
    END LOOP;

    RAISE NOTICE '[CRON WEEKLY] OZON weekly sync completed';
  END $BODY$;
  $$
);

DO $$
BEGIN
  RAISE NOTICE '  ✓ Создан: sync-ozon-weekly (каждое воскресенье в 03:00)';
END $$;

-- ===========================================================================
-- ШАГ 4: ОЧИСТКА ДУБЛЕЙ ОТВЕТОВ
-- ===========================================================================

DO $$
DECLARE
  duplicates_count INTEGER;
  deleted_count INTEGER;
BEGIN
  RAISE NOTICE 'ШАГ 4/5: Очистка дублей ответов...';

  -- Подсчитываем дубли
  SELECT COUNT(*)
  INTO duplicates_count
  FROM (
    SELECT review_id, COUNT(*) as cnt
    FROM replies
    WHERE review_id IS NOT NULL
      AND deleted_at IS NULL
      AND status IN ('drafted', 'scheduled')
    GROUP BY review_id
    HAVING COUNT(*) > 1
  ) sub;

  RAISE NOTICE '  Найдено отзывов с дублями: %', duplicates_count;

  -- Создаем резервную копию (если еще нет)
  DROP TABLE IF EXISTS replies_backup_20260220;
  CREATE TABLE replies_backup_20260220 AS
  SELECT * FROM replies WHERE deleted_at IS NULL;

  RAISE NOTICE '  ✓ Создана резервная копия: replies_backup_20260220';

  -- Удаляем дубли (оставляем только первый ответ)
  WITH duplicates AS (
    SELECT
      id,
      ROW_NUMBER() OVER (PARTITION BY review_id ORDER BY created_at ASC) as rn
    FROM replies
    WHERE review_id IS NOT NULL
      AND deleted_at IS NULL
      AND status IN ('drafted', 'scheduled')
  )
  UPDATE replies
  SET deleted_at = NOW()
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE '  ✓ Удалено дублей: %', deleted_count;
END $$;

-- ===========================================================================
-- ШАГ 5: ФИНАЛЬНАЯ ПРОВЕРКА
-- ===========================================================================

DO $$
BEGIN
  RAISE NOTICE 'ШАГ 5/5: Финальная проверка...';
  RAISE NOTICE '';
END $$;

-- Проверяем cron jobs
SELECT
  '✓ CRON JOBS СОЗДАНЫ' as status,
  jobname,
  schedule,
  active,
  CASE
    WHEN active THEN '✅ Активен'
    ELSE '❌ Не активен'
  END as job_status
FROM cron.job
WHERE jobname IN ('sync-ozon-incremental', 'sync-ozon-weekly')
ORDER BY jobname;

-- Проверяем дубли
SELECT
  'ПРОВЕРКА ДУБЛЕЙ' as status,
  COUNT(DISTINCT review_id) as reviews_with_duplicates,
  SUM(cnt - 1) as total_duplicates
FROM (
  SELECT review_id, COUNT(*) as cnt
  FROM replies
  WHERE review_id IS NOT NULL
    AND deleted_at IS NULL
    AND status IN ('drafted', 'scheduled')
  GROUP BY review_id
  HAVING COUNT(*) > 1
) sub;

-- Статистика маркетплейсов
SELECT
  'МАРКЕТПЛЕЙСЫ' as info,
  name,
  is_active,
  sync_mode,
  service_account_email IS NOT NULL as has_credentials,
  last_sync_at
FROM marketplaces
WHERE type = 'ozon';

-- ===========================================================================
-- ИТОГИ
-- ===========================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ АВТОМАТИЧЕСКАЯ НАСТРОЙКА ЗАВЕРШЕНА!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'СЛЕДУЮЩИЕ ШАГИ:';
  RAISE NOTICE '1. Деплой Edge Functions (см. AUTO_DEPLOY.sh)';
  RAISE NOTICE '2. Проверить логи Edge Functions';
  RAISE NOTICE '3. Запустить синхронизацию вручную в приложении';
  RAISE NOTICE '4. Дождаться первого автоматического запуска (через 10 минут)';
  RAISE NOTICE '';
  RAISE NOTICE 'Для проверки статуса выполните:';
  RAISE NOTICE 'SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE ''%ozon%'';';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
