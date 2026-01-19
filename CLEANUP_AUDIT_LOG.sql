-- =====================================================
-- ОЧИСТКА AUDIT_LOG СТАРШЕ 7 ДНЕЙ
-- =====================================================
-- Удаляет логи батчами по 2k записей (10 батчей = 20k за раз)

DO $$
DECLARE
  v_deleted_total BIGINT := 0;
  v_batch_num INT := 0;
  v_rows_deleted INT;
  v_cutoff_date TIMESTAMPTZ;
  v_start_time TIMESTAMP;
  v_max_batches INT := 10; -- Максимум 10 батчей за раз = 20k записей
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '7 days';

  RAISE NOTICE '🚀 НАЧИНАЕМ ОЧИСТКУ AUDIT_LOG...';
  RAISE NOTICE '   Дата отсечки: %', v_cutoff_date;
  RAISE NOTICE '';

  -- Удаляем батчами
  LOOP
    v_batch_num := v_batch_num + 1;

    DELETE FROM public.audit_log
    WHERE id IN (
      SELECT id
      FROM public.audit_log
      WHERE created_at < v_cutoff_date
      ORDER BY created_at ASC
      LIMIT 2000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_total := v_deleted_total + v_rows_deleted;

    -- Показываем прогресс каждые 5 батчей
    IF v_batch_num % 5 = 0 THEN
      RAISE NOTICE '   Батч %: удалено % | Всего: % | Время: %s',
        v_batch_num, v_rows_deleted, v_deleted_total,
        ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)), 1);
    END IF;

    PERFORM pg_sleep(0.2);

    -- Ограничиваем количество батчей за один запуск
    EXIT WHEN v_batch_num >= v_max_batches;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '✅ УДАЛЕНО: % записей за % батчей',
    v_deleted_total, v_batch_num;

  IF v_batch_num >= v_max_batches THEN
    RAISE NOTICE '⚠️  Достигнут лимит батчей. Запустите скрипт ещё раз для продолжения.';
  END IF;
END $$;

-- Показываем результат
SELECT
  COUNT(*) as records_left,
  pg_size_pretty(pg_total_relation_size('public.audit_log')) as size
FROM public.audit_log;
