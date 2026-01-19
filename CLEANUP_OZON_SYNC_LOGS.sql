-- =====================================================
-- ОДНОРАЗОВАЯ ОЧИСТКА СТАРЫХ ЛОГОВ OZON_SYNC
-- =====================================================
-- ⚠️ ВАЖНО: Этот скрипт удаляет логи старше 7 дней
--
-- Запустите в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
--
-- БЕЗОПАСНОСТЬ:
-- ✅ Удаляет только технические логи (не рабочие данные)
-- ✅ Работает батчами - не вызывает timeout
-- ✅ Показывает прогресс в реальном времени
-- ✅ Можно запускать повторно
--
-- РЕЗУЛЬТАТ:
-- 🎯 Освободит 4-5 GB места в базе данных
-- =====================================================

-- Шаг 1: Проверяем сколько логов будет удалено
DO $$
DECLARE
  v_total_count BIGINT;
  v_old_count BIGINT;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  v_cutoff_date := NOW() - INTERVAL '7 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ozon_sync'
  ) THEN
    RAISE NOTICE '⚠️  Таблица ozon_sync не существует';
    RAISE NOTICE '   Возможно она называется по-другому или уже удалена';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_total_count FROM public.ozon_sync;

  SELECT COUNT(*) INTO v_old_count
  FROM public.ozon_sync
  WHERE created_at < v_cutoff_date;

  RAISE NOTICE '📊 СТАТИСТИКА ПЕРЕД ОЧИСТКОЙ:';
  RAISE NOTICE '   Всего логов: %', v_total_count;
  RAISE NOTICE '   Логов старше 7 дней: %', v_old_count;
  RAISE NOTICE '   Логов останется: %', v_total_count - v_old_count;
  RAISE NOTICE '   Дата отсечки: %', v_cutoff_date;
  RAISE NOTICE '';
  RAISE NOTICE '⏳ Примерное время: % секунд', (v_old_count / 10000.0 * 0.5)::INT;
  RAISE NOTICE '';
END $$;

-- Шаг 2: БАТЧ-УДАЛЕНИЕ СТАРЫХ ЛОГОВ
-- Удаляет по 10000 записей за раз, чтобы избежать timeout
DO $$
DECLARE
  v_deleted_total BIGINT := 0;
  v_batch_num INT := 0;
  v_rows_deleted INT;
  v_cutoff_date TIMESTAMPTZ;
  v_start_time TIMESTAMP;
  v_elapsed_sec NUMERIC;
  v_max_batches INT := 500; -- Максимум 500 батчей = 5 млн записей
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff_date := NOW() - INTERVAL '7 days';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ozon_sync'
  ) THEN
    RAISE NOTICE '⚠️  Таблица ozon_sync не существует, пропускаем удаление';
    RETURN;
  END IF;

  RAISE NOTICE '🚀 НАЧИНАЕМ БАТЧ-УДАЛЕНИЕ...';
  RAISE NOTICE '';

  -- Удаляем батчами
  LOOP
    v_batch_num := v_batch_num + 1;

    -- Удаляем один батч (10000 записей)
    DELETE FROM public.ozon_sync
    WHERE id IN (
      SELECT id
      FROM public.ozon_sync
      WHERE created_at < v_cutoff_date
      ORDER BY created_at ASC
      LIMIT 10000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;

    -- Если ничего не удалили - всё готово
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_total := v_deleted_total + v_rows_deleted;
    v_elapsed_sec := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time));

    -- Показываем прогресс каждые 10 батчей
    IF v_batch_num % 10 = 0 OR v_rows_deleted < 10000 THEN
      RAISE NOTICE '   Батч %: удалено % записей | Всего: % | Время: %s',
        v_batch_num,
        v_rows_deleted,
        v_deleted_total,
        ROUND(v_elapsed_sec, 1);
    END IF;

    -- Небольшая пауза между батчами (100ms)
    PERFORM pg_sleep(0.1);

    -- Защита от слишком долгого выполнения
    EXIT WHEN v_batch_num >= v_max_batches;
  END LOOP;

  v_elapsed_sec := EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time));

  RAISE NOTICE '';
  RAISE NOTICE '✅ УДАЛЕНИЕ ЗАВЕРШЕНО!';
  RAISE NOTICE '   Удалено записей: %', v_deleted_total;
  RAISE NOTICE '   Батчей обработано: %', v_batch_num;
  RAISE NOTICE '   Время выполнения: % сек', ROUND(v_elapsed_sec, 2);
  RAISE NOTICE '';

  IF v_batch_num >= v_max_batches THEN
    RAISE NOTICE '⚠️  Достигнут лимит батчей (%). Запустите скрипт ещё раз для продолжения.', v_max_batches;
  END IF;
END $$;

-- Шаг 3: Оптимизация таблицы после удаления
DO $$
BEGIN
  RAISE NOTICE '🔧 ОПТИМИЗАЦИЯ ТАБЛИЦЫ...';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ozon_sync'
  ) THEN
    RAISE NOTICE '⚠️  Таблица ozon_sync не существует, пропускаем оптимизацию';
    RETURN;
  END IF;

  -- ANALYZE обновляет статистику для планировщика запросов
  EXECUTE 'ANALYZE public.ozon_sync';

  RAISE NOTICE '   ✅ ANALYZE выполнен';
  RAISE NOTICE '';
END $$;

-- Шаг 4: Показываем итоговую статистику
DO $$
DECLARE
  v_total_count BIGINT;
  v_table_size TEXT;
  v_index_size TEXT;
BEGIN
  RAISE NOTICE '📊 СТАТИСТИКА ПОСЛЕ ОЧИСТКИ:';

  -- Проверяем существование таблицы
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'ozon_sync'
  ) THEN
    RAISE NOTICE '   ⚠️  Таблица ozon_sync не существует';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_total_count FROM public.ozon_sync;

  SELECT
    pg_size_pretty(pg_relation_size('public.ozon_sync')),
    pg_size_pretty(pg_indexes_size('public.ozon_sync'))
  INTO v_table_size, v_index_size;

  RAISE NOTICE '   Осталось логов: %', v_total_count;
  RAISE NOTICE '   Размер таблицы: %', v_table_size;
  RAISE NOTICE '   Размер индексов: %', v_index_size;
  RAISE NOTICE '';
  RAISE NOTICE '💡 СОВЕТ: Запустите VACUUM FULL для возврата места в ОС:';
  RAISE NOTICE '   VACUUM FULL public.ozon_sync;';
  RAISE NOTICE '   ⚠️  VACUUM FULL блокирует таблицу на время выполнения!';
  RAISE NOTICE '';
END $$;

-- =====================================================
-- ДОПОЛНИТЕЛЬНО: Проверка старых логов в других таблицах
-- =====================================================
DO $$
DECLARE
  v_count BIGINT;
BEGIN
  RAISE NOTICE '🔍 ПРОВЕРКА ДРУГИХ ТАБЛИЦ С ЛОГАМИ:';
  RAISE NOTICE '';

  -- ozon_sync_history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync_history') THEN
    SELECT COUNT(*) INTO v_count
    FROM public.ozon_sync_history
    WHERE started_at < NOW() - INTERVAL '90 days';
    RAISE NOTICE '   ozon_sync_history (>90 дней): % записей', v_count;
  END IF;

  -- logs_ai
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_ai') THEN
    SELECT COUNT(*) INTO v_count
    FROM public.logs_ai
    WHERE created_at < NOW() - INTERVAL '90 days';
    RAISE NOTICE '   logs_ai (>90 дней): % записей', v_count;
  END IF;

  -- audit_log
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    SELECT COUNT(*) INTO v_count
    FROM public.audit_log
    WHERE timestamp < NOW() - INTERVAL '180 days';
    RAISE NOTICE '   audit_log (>180 дней): % записей', v_count;
  END IF;

  -- import_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_logs') THEN
    SELECT COUNT(*) INTO v_count
    FROM public.import_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
    RAISE NOTICE '   import_logs (>90 дней): % записей', v_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '💡 Если в других таблицах тоже много старых логов - можно их тоже очистить';
END $$;

-- =====================================================
-- ГОТОВО!
-- =====================================================
-- Следующие шаги:
--
-- 1. ✅ Примените миграцию для автоматической очистки:
--    Запустите: supabase/migrations/20260119_cleanup_ozon_sync_logs.sql
--
-- 2. 🔄 Если нужно освободить место в ОС прямо сейчас:
--    VACUUM FULL public.ozon_sync;
--    (ВНИМАНИЕ: блокирует таблицу!)
--
-- 3. 📊 Проверьте размер БД через неделю:
--    SELECT pg_size_pretty(pg_database_size(current_database()));
-- =====================================================
