-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ИСТОРИИ AI ОТВЕТОВ
-- =====================================================
-- Таблица ai_reply_history хранит историю регенераций AI ответов.
-- По согласованию с пользователем: хранить 30 дней.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления истории (избегает timeout)
-- 2. Настраивает cron job для еженедельной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРОЙ ИСТОРИИ AI
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_ai_reply_history()
RETURNS TABLE (
  deleted_count BIGINT,
  total_time_ms BIGINT,
  batches_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_batch_count INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_cutoff_date TIMESTAMPTZ;
  v_max_batches INT := 50; -- Максимум 50 батчей за один запуск (= 500k записей)
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '30 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ai_reply_history'
  ) THEN
    RAISE NOTICE 'Таблица ai_reply_history не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку ai_reply_history старше %', v_cutoff_date;

  -- Удаляем батчами по 10000 записей
  LOOP
    DELETE FROM public.ai_reply_history
    WHERE id IN (
      SELECT id
      FROM public.ai_reply_history
      WHERE created_at < v_cutoff_date
      ORDER BY created_at ASC
      LIMIT 10000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    -- Небольшая пауза между батчами
    PERFORM pg_sleep(0.1);

    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  -- Если удалили больше 1000 записей - запускаем ANALYZE
  IF v_deleted_count > 1000 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE public.ai_reply_history';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_ai_reply_history() IS
  'Батч-удаление истории AI ответов старше 30 дней. ' ||
  'Удаляет до 500k записей за раз (50 батчей по 10k).';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждое воскресенье в 04:00 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-ai-reply-history-weekly'
  ) THEN
    PERFORM cron.unschedule('cleanup-ai-reply-history-weekly');
    RAISE NOTICE 'Удалён старый cron job: cleanup-ai-reply-history-weekly';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-ai-reply-history-weekly',
  '0 4 * * 0',  -- Каждое воскресенье в 04:00 UTC
  $$
    SELECT public.cleanup_ai_reply_history();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-ai-reply-history-weekly';
  RAISE NOTICE '   Расписание: каждое воскресенье в 04:00 UTC';
  RAISE NOTICE '   Период хранения: 30 дней';
END $$;
-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ЛОГОВ AI ОШИБОК
-- =====================================================
-- Таблица logs_ai хранит логи ошибок при генерации AI ответов.
-- По согласованию с пользователем: хранить 7 дней.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления логов (избегает timeout)
-- 2. Настраивает cron job для ежедневной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРЫХ ЛОГОВ AI
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_logs_ai()
RETURNS TABLE (
  deleted_count BIGINT,
  total_time_ms BIGINT,
  batches_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_batch_count INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_cutoff_date TIMESTAMPTZ;
  v_max_batches INT := 100;
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '7 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'logs_ai'
  ) THEN
    RAISE NOTICE 'Таблица logs_ai не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку logs_ai старше %', v_cutoff_date;

  -- Удаляем батчами по 10000 записей
  LOOP
    DELETE FROM public.logs_ai
    WHERE id IN (
      SELECT id
      FROM public.logs_ai
      WHERE created_at < v_cutoff_date
      ORDER BY created_at ASC
      LIMIT 10000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    PERFORM pg_sleep(0.1);

    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  IF v_deleted_count > 1000 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE public.logs_ai';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_logs_ai() IS
  'Батч-удаление логов AI ошибок старше 7 дней. ' ||
  'Удаляет до 1 млн записей за раз (100 батчей по 10k).';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждый день в 05:00 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-logs-ai-daily'
  ) THEN
    PERFORM cron.unschedule('cleanup-logs-ai-daily');
    RAISE NOTICE 'Удалён старый cron job: cleanup-logs-ai-daily';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-logs-ai-daily',
  '0 5 * * *',  -- Каждый день в 05:00 UTC
  $$
    SELECT public.cleanup_logs_ai();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-logs-ai-daily';
  RAISE NOTICE '   Расписание: каждый день в 05:00 UTC';
  RAISE NOTICE '   Период хранения: 7 дней';
END $$;
-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ЛОГОВ ИМПОРТА
-- =====================================================
-- Таблица import_logs хранит историю импорта файлов.
-- По согласованию с пользователем: хранить 7 дней.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления логов (избегает timeout)
-- 2. Настраивает cron job для ежедневной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРЫХ ЛОГОВ ИМПОРТА
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_import_logs()
RETURNS TABLE (
  deleted_count BIGINT,
  total_time_ms BIGINT,
  batches_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_batch_count INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_cutoff_date TIMESTAMPTZ;
  v_max_batches INT := 50;
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '7 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'import_logs'
  ) THEN
    RAISE NOTICE 'Таблица import_logs не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку import_logs старше %', v_cutoff_date;

  -- Удаляем батчами по 5000 записей (импортов обычно меньше)
  LOOP
    DELETE FROM public.import_logs
    WHERE id IN (
      SELECT id
      FROM public.import_logs
      WHERE created_at < v_cutoff_date
      ORDER BY created_at ASC
      LIMIT 5000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    PERFORM pg_sleep(0.1);

    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  IF v_deleted_count > 500 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE public.import_logs';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_import_logs() IS
  'Батч-удаление логов импорта старше 7 дней. ' ||
  'Удаляет до 250k записей за раз (50 батчей по 5k).';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждый день в 05:30 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-import-logs-daily'
  ) THEN
    PERFORM cron.unschedule('cleanup-import-logs-daily');
    RAISE NOTICE 'Удалён старый cron job: cleanup-import-logs-daily';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-import-logs-daily',
  '30 5 * * *',  -- Каждый день в 05:30 UTC
  $$
    SELECT public.cleanup_import_logs();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-import-logs-daily';
  RAISE NOTICE '   Расписание: каждый день в 05:30 UTC';
  RAISE NOTICE '   Период хранения: 7 дней';
END $$;
-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ИСТОРИИ СИНХРОНИЗАЦИЙ OZON
-- =====================================================
-- Таблица ozon_sync_history хранит историю синхронизаций
-- с OZON Performance API.
-- По согласованию с пользователем: хранить 30 дней.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления истории (избегает timeout)
-- 2. Настраивает cron job для еженедельной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРОЙ ИСТОРИИ СИНХРОНИЗАЦИЙ
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_ozon_sync_history()
RETURNS TABLE (
  deleted_count BIGINT,
  total_time_ms BIGINT,
  batches_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_batch_count INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_cutoff_date TIMESTAMPTZ;
  v_max_batches INT := 50;
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '30 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ozon_sync_history'
  ) THEN
    RAISE NOTICE 'Таблица ozon_sync_history не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку ozon_sync_history старше %', v_cutoff_date;

  -- Удаляем батчами по 5000 записей
  LOOP
    DELETE FROM public.ozon_sync_history
    WHERE id IN (
      SELECT id
      FROM public.ozon_sync_history
      WHERE started_at < v_cutoff_date
      ORDER BY started_at ASC
      LIMIT 5000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    PERFORM pg_sleep(0.1);

    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  IF v_deleted_count > 500 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE public.ozon_sync_history';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_ozon_sync_history() IS
  'Батч-удаление истории OZON синхронизаций старше 30 дней. ' ||
  'Удаляет до 250k записей за раз (50 батчей по 5k).';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждое воскресенье в 06:00 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-ozon-sync-history-weekly'
  ) THEN
    PERFORM cron.unschedule('cleanup-ozon-sync-history-weekly');
    RAISE NOTICE 'Удалён старый cron job: cleanup-ozon-sync-history-weekly';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-ozon-sync-history-weekly',
  '0 6 * * 0',  -- Каждое воскресенье в 06:00 UTC
  $$
    SELECT public.cleanup_ozon_sync_history();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-ozon-sync-history-weekly';
  RAISE NOTICE '   Расписание: каждое воскресенье в 06:00 UTC';
  RAISE NOTICE '   Период хранения: 30 дней';
END $$;
-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ЛОГОВ CRON ЗАДАЧ
-- =====================================================
-- Таблица cron.job_run_details хранит логи выполнения
-- всех CRON задач. Может занимать много места (~59 MB).
-- По согласованию с пользователем: хранить 7 дней.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления логов (избегает timeout)
-- 2. Настраивает cron job для ежедневной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРЫХ ЛОГОВ CRON
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_cron_job_run_details()
RETURNS TABLE (
  deleted_count BIGINT,
  total_time_ms BIGINT,
  batches_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_batch_count INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_cutoff_date TIMESTAMPTZ;
  v_max_batches INT := 100;
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '7 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'cron'
    AND table_name = 'job_run_details'
  ) THEN
    RAISE NOTICE 'Таблица cron.job_run_details не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку cron.job_run_details старше %', v_cutoff_date;

  -- Удаляем батчами по 10000 записей
  -- CRON задачи могут создавать очень много логов
  LOOP
    DELETE FROM cron.job_run_details
    WHERE jobid IN (
      SELECT jobid
      FROM cron.job_run_details
      WHERE end_time < v_cutoff_date
      ORDER BY end_time ASC
      LIMIT 10000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    PERFORM pg_sleep(0.1);

    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  IF v_deleted_count > 1000 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE cron.job_run_details';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_cron_job_run_details() IS
  'Батч-удаление логов CRON задач старше 7 дней. ' ||
  'Удаляет до 1 млн записей за раз (100 батчей по 10k).';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждый день в 06:00 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-cron-job-run-details-daily'
  ) THEN
    PERFORM cron.unschedule('cleanup-cron-job-run-details-daily');
    RAISE NOTICE 'Удалён старый cron job: cleanup-cron-job-run-details-daily';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-cron-job-run-details-daily',
  '0 6 * * *',  -- Каждый день в 06:00 UTC
  $$
    SELECT public.cleanup_cron_job_run_details();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-cron-job-run-details-daily';
  RAISE NOTICE '   Расписание: каждый день в 06:00 UTC';
  RAISE NOTICE '   Период хранения: 7 дней';
END $$;
-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА ЛОГОВ FALLBACK ДЕЙСТВИЙ
-- =====================================================
-- Таблица fallback_action_logs хранит логи fallback действий.
-- По согласованию с пользователем: хранить 7 дней.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления логов (избегает timeout)
-- 2. Настраивает cron job для ежедневной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРЫХ ЛОГОВ FALLBACK
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_fallback_action_logs()
RETURNS TABLE (
  deleted_count BIGINT,
  total_time_ms BIGINT,
  batches_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_batch_count INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_cutoff_date TIMESTAMPTZ;
  v_max_batches INT := 50;
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '7 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'fallback_action_logs'
  ) THEN
    RAISE NOTICE 'Таблица fallback_action_logs не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку fallback_action_logs старше %', v_cutoff_date;

  -- Удаляем батчами по 5000 записей
  LOOP
    DELETE FROM public.fallback_action_logs
    WHERE id IN (
      SELECT id
      FROM public.fallback_action_logs
      WHERE created_at < v_cutoff_date
      ORDER BY created_at ASC
      LIMIT 5000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    PERFORM pg_sleep(0.1);

    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  IF v_deleted_count > 500 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE public.fallback_action_logs';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_fallback_action_logs() IS
  'Батч-удаление логов fallback действий старше 7 дней. ' ||
  'Удаляет до 250k записей за раз (50 батчей по 5k).';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждый день в 06:30 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-fallback-action-logs-daily'
  ) THEN
    PERFORM cron.unschedule('cleanup-fallback-action-logs-daily');
    RAISE NOTICE 'Удалён старый cron job: cleanup-fallback-action-logs-daily';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-fallback-action-logs-daily',
  '30 6 * * *',  -- Каждый день в 06:30 UTC
  $$
    SELECT public.cleanup_fallback_action_logs();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-fallback-action-logs-daily';
  RAISE NOTICE '   Расписание: каждый день в 06:30 UTC';
  RAISE NOTICE '   Период хранения: 7 дней';
END $$;
-- =====================================================
-- УДАЛЕНИЕ ВСЕХ ДАННЫХ ИЗ CONSENT_LOGS
-- =====================================================
-- Таблица consent_logs не используется в текущей системе.
-- По согласованию с пользователем: не хранить эти данные.
--
-- Эта миграция:
-- 1. Удаляет все существующие записи
-- 2. Настраивает cron job для ежедневной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ ПОЛНОЙ ОЧИСТКИ CONSENT_LOGS
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_consent_logs()
RETURNS TABLE (
  deleted_count BIGINT,
  total_time_ms BIGINT,
  batches_processed INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_count BIGINT := 0;
  v_batch_count INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_max_batches INT := 100;
BEGIN
  v_start_time := clock_timestamp();

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'consent_logs'
  ) THEN
    RAISE NOTICE 'Таблица consent_logs не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем полную очистку consent_logs';

  -- Удаляем ВСЕ записи батчами по 5000
  LOOP
    DELETE FROM public.consent_logs
    WHERE id IN (
      SELECT id
      FROM public.consent_logs
      ORDER BY created_at ASC
      LIMIT 5000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    PERFORM pg_sleep(0.1);

    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  IF v_deleted_count > 500 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE public.consent_logs';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_consent_logs() IS
  'Полная очистка таблицы consent_logs (удаляет ВСЕ записи). ' ||
  'Таблица не используется в текущей системе. ' ||
  'Удаляет до 500k записей за раз (100 батчей по 5k).';

-- =====================================================
-- ОДНОРАЗОВАЯ ОЧИСТКА СУЩЕСТВУЮЩИХ ДАННЫХ
-- =====================================================
-- Удаляем все данные, которые уже есть в таблице

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  -- Проверяем количество записей
  SELECT COUNT(*) INTO v_count
  FROM public.consent_logs;

  IF v_count > 0 THEN
    RAISE NOTICE 'Найдено % записей в consent_logs, запускаем очистку...', v_count;
    PERFORM public.cleanup_consent_logs();
  ELSE
    RAISE NOTICE 'Таблица consent_logs пуста, очистка не требуется';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Таблица может не существовать, игнорируем ошибку
    RAISE NOTICE 'Таблица consent_logs не найдена или ошибка: %', SQLERRM;
END $$;

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждый день в 07:00 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-consent-logs-daily'
  ) THEN
    PERFORM cron.unschedule('cleanup-consent-logs-daily');
    RAISE NOTICE 'Удалён старый cron job: cleanup-consent-logs-daily';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-consent-logs-daily',
  '0 7 * * *',  -- Каждый день в 07:00 UTC
  $$
    SELECT public.cleanup_consent_logs();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-consent-logs-daily';
  RAISE NOTICE '   Расписание: каждый день в 07:00 UTC';
  RAISE NOTICE '   Период хранения: не хранить (удалять все записи)';
END $$;
