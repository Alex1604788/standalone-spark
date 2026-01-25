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
