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
