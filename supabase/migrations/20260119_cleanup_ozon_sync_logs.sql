-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА СТАРЫХ ЛОГОВ OZON SYNC
-- =====================================================
-- Таблица ozon_sync содержит логи синхронизации и может
-- занимать несколько GB. Эти логи нужны только для отладки
-- и их можно безопасно удалять после 7 дней.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления логов (избегает timeout)
-- 2. Настраивает cron job для ежедневной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРЫХ ЛОГОВ
-- =====================================================
-- Удаляет логи старше 7 дней небольшими порциями (10000 записей)
-- чтобы избежать timeout при удалении миллионов записей

CREATE OR REPLACE FUNCTION public.cleanup_ozon_sync_logs()
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
  v_max_batches INT := 100; -- Максимум 100 батчей за один запуск (= 1 млн записей)
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '7 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ozon_sync'
  ) THEN
    RAISE NOTICE 'Таблица ozon_sync не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку логов ozon_sync старше %', v_cutoff_date;

  -- Удаляем батчами по 10000 записей
  LOOP
    -- Удаляем один батч
    DELETE FROM public.ozon_sync
    WHERE id IN (
      SELECT id
      FROM public.ozon_sync
      WHERE created_at < v_cutoff_date
      ORDER BY created_at ASC
      LIMIT 10000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

    -- Если ничего не удалили - выходим
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_count := v_deleted_count + v_rows_deleted;
    v_batch_count := v_batch_count + 1;

    RAISE NOTICE 'Батч %: удалено % записей (всего: %)',
      v_batch_count, v_rows_deleted, v_deleted_count;

    -- Небольшая пауза между батчами для снижения нагрузки
    PERFORM pg_sleep(0.1);

    -- Ограничиваем количество батчей за один запуск
    EXIT WHEN v_batch_count >= v_max_batches;
  END LOOP;

  -- Если удалили больше 1000 записей - запускаем ANALYZE
  IF v_deleted_count > 1000 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации планировщика запросов...';
    EXECUTE 'ANALYZE public.ozon_sync';
  END IF;

  -- Возвращаем статистику
  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

-- Комментарий для документации
COMMENT ON FUNCTION public.cleanup_ozon_sync_logs() IS
  'Батч-удаление логов ozon_sync старше 7 дней. ' ||
  'Удаляет до 1 млн записей за раз (100 батчей по 10k). ' ||
  'Безопасно для выполнения на продакшене.';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждый день в 03:00 UTC

-- Удаляем старый cron job если существует
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-ozon-sync-logs-daily'
  ) THEN
    PERFORM cron.unschedule('cleanup-ozon-sync-logs-daily');
    RAISE NOTICE 'Удалён старый cron job: cleanup-ozon-sync-logs-daily';
  END IF;
END $$;

-- Создаем новый cron job
SELECT cron.schedule(
  'cleanup-ozon-sync-logs-daily',  -- Имя задачи
  '0 3 * * *',                      -- Каждый день в 03:00 UTC
  $$
    SELECT public.cleanup_ozon_sync_logs();
  $$
);

-- Комментарий для отладки
DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-ozon-sync-logs-daily';
  RAISE NOTICE '   Расписание: каждый день в 03:00 UTC';
  RAISE NOTICE '   Функция: public.cleanup_ozon_sync_logs()';
END $$;

-- =====================================================
-- ПРОВЕРКА УСТАНОВКИ
-- =====================================================

-- Показываем созданную задачу
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname = 'cleanup-ozon-sync-logs-daily';

-- Показываем информацию о функции
SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'cleanup_ozon_sync_logs';
