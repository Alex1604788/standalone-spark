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
