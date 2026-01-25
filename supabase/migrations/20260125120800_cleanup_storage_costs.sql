-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА СТОИМОСТИ ХРАНЕНИЯ
-- =====================================================
-- Таблица storage_costs хранит ежедневные данные о
-- стоимости хранения товаров на складе OZON.
-- Рекомендация: хранить 6 месяцев.
--
-- Эта миграция:
-- 1. Создает функцию для батч-удаления старых данных (избегает timeout)
-- 2. Настраивает cron job для ежемесячной очистки
-- =====================================================

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =====================================================
-- ФУНКЦИЯ ДЛЯ БАТЧ-УДАЛЕНИЯ СТАРЫХ ДАННЫХ STORAGE COSTS
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_storage_costs()
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
  v_cutoff_date DATE;
  v_max_batches INT := 50; -- Максимум 50 батчей за один запуск (= 250k записей)
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := CURRENT_DATE - INTERVAL '6 months';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'storage_costs'
  ) THEN
    RAISE NOTICE 'Таблица storage_costs не существует, пропускаем очистку';
    deleted_count := 0;
    total_time_ms := 0;
    batches_processed := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE NOTICE 'Начинаем очистку storage_costs старше %', v_cutoff_date;

  -- Удаляем батчами по 5000 записей
  LOOP
    DELETE FROM public.storage_costs
    WHERE id IN (
      SELECT id
      FROM public.storage_costs
      WHERE cost_date < v_cutoff_date
      ORDER BY cost_date ASC
      LIMIT 5000
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

  -- Если удалили больше 500 записей - запускаем ANALYZE
  IF v_deleted_count > 500 THEN
    RAISE NOTICE 'Запускаем ANALYZE для оптимизации...';
    EXECUTE 'ANALYZE public.storage_costs';
  END IF;

  deleted_count := v_deleted_count;
  total_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000;
  batches_processed := v_batch_count;

  RAISE NOTICE 'Очистка завершена: удалено % записей за % батчей (%.2f сек)',
    v_deleted_count, v_batch_count, total_time_ms / 1000.0;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.cleanup_storage_costs() IS
  'Батч-удаление данных storage_costs старше 6 месяцев. ' ||
  'Удаляет до 250k записей за раз (50 батчей по 5k).';

-- =====================================================
-- CRON JOB ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Запускается каждое 1-е число месяца в 02:00 UTC

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-storage-costs-monthly'
  ) THEN
    PERFORM cron.unschedule('cleanup-storage-costs-monthly');
    RAISE NOTICE 'Удалён старый cron job: cleanup-storage-costs-monthly';
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-storage-costs-monthly',
  '0 2 1 * *',  -- Каждое 1-е число месяца в 02:00 UTC
  $$
    SELECT public.cleanup_storage_costs();
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ Создан cron job: cleanup-storage-costs-monthly';
  RAISE NOTICE '   Расписание: каждое 1-е число месяца в 02:00 UTC';
  RAISE NOTICE '   Период хранения: 6 месяцев';
END $$;
