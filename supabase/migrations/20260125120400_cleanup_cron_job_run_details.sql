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
