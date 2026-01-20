-- =====================================================
-- ЭКСТРЕННАЯ ОЧИСТКА БАЗЫ ДАННЫХ ИЗ READ-ONLY РЕЖИМА
-- =====================================================
-- ⚠️  ВНИМАНИЕ: Запускайте этот скрипт только если база данных
-- находится в режиме read-only из-за переполнения дискового пространства!
-- =====================================================

\echo '🚨 ЭКСТРЕННАЯ ОЧИСТКА БАЗЫ ДАННЫХ'
\echo '⚠️  Этот скрипт удалит СТАРЫЕ ЛОГИ для освобождения места'
\echo ''

-- =====================================================
-- ШАГ 1: ДИАГНОСТИКА ТЕКУЩЕГО СОСТОЯНИЯ
-- =====================================================

\echo '📊 ШАГ 1: Диагностика текущего состояния базы данных...'
\echo ''

-- Общий размер базы данных
SELECT
  '🔍 ОБЩИЙ РАЗМЕР БД' as metric,
  pg_size_pretty(pg_database_size(current_database())) as size,
  pg_database_size(current_database()) / 1024 / 1024 / 1024.0 as size_gb
FROM pg_database
WHERE datname = current_database();

\echo ''
\echo '📦 ТОП 10 САМЫХ БОЛЬШИХ ТАБЛИЦ:'

-- Топ 10 самых больших таблиц
SELECT
  ROW_NUMBER() OVER (ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC) as rank,
  tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as data_size,
  pg_total_relation_size(schemaname||'.'||tablename) / 1024 / 1024 as size_mb
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

\echo ''
\echo '🗑️  КОЛИЧЕСТВО СТАРЫХ ЗАПИСЕЙ ДЛЯ УДАЛЕНИЯ:'

-- Проверка старых данных
DO $$
DECLARE
  v_audit_log_old BIGINT;
  v_ozon_sync_old BIGINT;
  v_logs_ai_old BIGINT;
  v_ai_reply_history_old BIGINT;
  v_import_logs_old BIGINT;
  v_ozon_sync_history_old BIGINT;
BEGIN
  -- audit_log
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    SELECT COUNT(*) INTO v_audit_log_old FROM public.audit_log WHERE created_at < NOW() - INTERVAL '7 days';
    RAISE NOTICE '   audit_log (>7 дней): % записей', v_audit_log_old;
  ELSE
    RAISE NOTICE '   audit_log: таблица не найдена';
  END IF;

  -- ozon_sync
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync') THEN
    SELECT COUNT(*) INTO v_ozon_sync_old FROM public.ozon_sync WHERE created_at < NOW() - INTERVAL '7 days';
    RAISE NOTICE '   ozon_sync (>7 дней): % записей', v_ozon_sync_old;
  ELSE
    RAISE NOTICE '   ozon_sync: таблица не найдена';
  END IF;

  -- logs_ai
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_ai') THEN
    SELECT COUNT(*) INTO v_logs_ai_old FROM public.logs_ai WHERE created_at < NOW() - INTERVAL '90 days';
    RAISE NOTICE '   logs_ai (>90 дней): % записей', v_logs_ai_old;
  ELSE
    RAISE NOTICE '   logs_ai: таблица не найдена';
  END IF;

  -- ai_reply_history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_reply_history') THEN
    SELECT COUNT(*) INTO v_ai_reply_history_old FROM public.ai_reply_history WHERE created_at < NOW() - INTERVAL '90 days';
    RAISE NOTICE '   ai_reply_history (>90 дней): % записей', v_ai_reply_history_old;
  ELSE
    RAISE NOTICE '   ai_reply_history: таблица не найдена';
  END IF;

  -- import_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_logs') THEN
    SELECT COUNT(*) INTO v_import_logs_old FROM public.import_logs WHERE created_at < NOW() - INTERVAL '90 days';
    RAISE NOTICE '   import_logs (>90 дней): % записей', v_import_logs_old;
  ELSE
    RAISE NOTICE '   import_logs: таблица не найдена';
  END IF;

  -- ozon_sync_history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync_history') THEN
    SELECT COUNT(*) INTO v_ozon_sync_history_old FROM public.ozon_sync_history WHERE started_at < NOW() - INTERVAL '90 days';
    RAISE NOTICE '   ozon_sync_history (>90 дней): % записей', v_ozon_sync_history_old;
  ELSE
    RAISE NOTICE '   ozon_sync_history: таблица не найдена';
  END IF;
END $$;

\echo ''
\echo '⚠️  ВНИМАНИЕ: Сейчас будет запущена очистка старых логов!'
\echo '   Это может занять от 5 минут до нескольких часов'
\echo '   в зависимости от количества данных.'
\echo ''
\echo '✅ Данные которые НЕ будут удалены:'
\echo '   - product_knowledge (база знаний для ИИ)'
\echo '   - products, reviews, replies'
\echo '   - marketplaces, profiles, suppliers'
\echo '   - Все рабочие данные'
\echo ''
\echo '🗑️  Данные которые БУДУТ удалены:'
\echo '   - Логи старше 7-90 дней (технические данные)'
\echo ''

-- Пауза для подтверждения (если запускается интерактивно)
-- \prompt 'Продолжить? (yes/no): ' confirm

-- =====================================================
-- ШАГ 2: БЫСТРАЯ ОЧИСТКА AUDIT_LOG (ПРИОРИТЕТ 1)
-- =====================================================

\echo ''
\echo '🔥 ШАГ 2: Экстренная очистка audit_log...'

DO $$
DECLARE
  v_deleted_total BIGINT := 0;
  v_batch_num INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_max_batches INT := 50; -- Максимум 50 батчей = 25,000 записей
BEGIN
  -- Проверяем существование таблицы
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    RAISE NOTICE '   ⚠️  Таблица audit_log не найдена, пропускаем';
    RETURN;
  END IF;

  v_start_time := clock_timestamp();
  RAISE NOTICE '   Удаляю старые записи из audit_log...';

  -- Удаляем батчами по 500 записей
  LOOP
    v_batch_num := v_batch_num + 1;

    DELETE FROM public.audit_log
    WHERE ctid IN (
      SELECT ctid
      FROM public.audit_log
      WHERE created_at < NOW() - INTERVAL '7 days'
      ORDER BY created_at ASC
      LIMIT 500
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_total := v_deleted_total + v_rows_deleted;

    -- Показываем прогресс каждые 10 батчей
    IF v_batch_num % 10 = 0 THEN
      RAISE NOTICE '   Батч %: удалено % | Всего: % | Время: %s',
        v_batch_num, v_rows_deleted, v_deleted_total,
        ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)), 1);
    END IF;

    PERFORM pg_sleep(0.1);

    -- Ограничиваем количество батчей за один запуск
    EXIT WHEN v_batch_num >= v_max_batches;
  END LOOP;

  RAISE NOTICE '   ✅ audit_log: удалено % записей за % батчей',
    v_deleted_total, v_batch_num;

  IF v_batch_num >= v_max_batches THEN
    RAISE NOTICE '   ⚠️  Достигнут лимит батчей. Для продолжения очистки запустите AUTO_CLEANUP_URGENT.sql';
  END IF;
END $$;

-- =====================================================
-- ШАГ 3: БЫСТРАЯ ОЧИСТКА OZON_SYNC (ПРИОРИТЕТ 2)
-- =====================================================

\echo ''
\echo '🔥 ШАГ 3: Экстренная очистка ozon_sync...'

DO $$
DECLARE
  v_deleted_total BIGINT := 0;
  v_batch_num INT := 0;
  v_rows_deleted INT;
  v_start_time TIMESTAMP;
  v_max_batches INT := 50;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync') THEN
    RAISE NOTICE '   ⚠️  Таблица ozon_sync не найдена, пропускаем';
    RETURN;
  END IF;

  v_start_time := clock_timestamp();
  RAISE NOTICE '   Удаляю старые записи из ozon_sync...';

  LOOP
    v_batch_num := v_batch_num + 1;

    DELETE FROM public.ozon_sync
    WHERE id IN (
      SELECT id
      FROM public.ozon_sync
      WHERE created_at < NOW() - INTERVAL '7 days'
      ORDER BY created_at ASC
      LIMIT 1000
    );

    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
    EXIT WHEN v_rows_deleted = 0;

    v_deleted_total := v_deleted_total + v_rows_deleted;

    IF v_batch_num % 5 = 0 THEN
      RAISE NOTICE '   Батч %: удалено % | Всего: %',
        v_batch_num, v_rows_deleted, v_deleted_total;
    END IF;

    PERFORM pg_sleep(0.1);
    EXIT WHEN v_batch_num >= v_max_batches;
  END LOOP;

  RAISE NOTICE '   ✅ ozon_sync: удалено % записей', v_deleted_total;
END $$;

-- =====================================================
-- ШАГ 4: ОЧИСТКА ДРУГИХ ЛОГ-ТАБЛИЦ
-- =====================================================

\echo ''
\echo '🔥 ШАГ 4: Очистка других лог-таблиц...'

-- logs_ai
DO $$
DECLARE
  v_deleted BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_ai') THEN
    RETURN;
  END IF;

  DELETE FROM public.logs_ai
  WHERE id IN (
    SELECT id FROM public.logs_ai
    WHERE created_at < NOW() - INTERVAL '90 days'
    LIMIT 10000
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '   ✅ logs_ai: удалено % записей', v_deleted;
END $$;

-- ai_reply_history
DO $$
DECLARE
  v_deleted BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_reply_history') THEN
    RETURN;
  END IF;

  DELETE FROM public.ai_reply_history
  WHERE id IN (
    SELECT id FROM public.ai_reply_history
    WHERE created_at < NOW() - INTERVAL '90 days'
    LIMIT 10000
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '   ✅ ai_reply_history: удалено % записей', v_deleted;
END $$;

-- import_logs
DO $$
DECLARE
  v_deleted BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_logs') THEN
    RETURN;
  END IF;

  DELETE FROM public.import_logs
  WHERE id IN (
    SELECT id FROM public.import_logs
    WHERE created_at < NOW() - INTERVAL '90 days'
    LIMIT 10000
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '   ✅ import_logs: удалено % записей', v_deleted;
END $$;

-- ozon_sync_history
DO $$
DECLARE
  v_deleted BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync_history') THEN
    RETURN;
  END IF;

  DELETE FROM public.ozon_sync_history
  WHERE id IN (
    SELECT id FROM public.ozon_sync_history
    WHERE started_at < NOW() - INTERVAL '90 days'
    LIMIT 10000
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '   ✅ ozon_sync_history: удалено % записей', v_deleted;
END $$;

-- =====================================================
-- ШАГ 5: ИТОГОВАЯ ДИАГНОСТИКА
-- =====================================================

\echo ''
\echo '📊 ШАГ 5: Проверка результатов...'
\echo ''

SELECT
  '✅ ОЧИСТКА ЗАВЕРШЕНА!' as status,
  pg_size_pretty(pg_database_size(current_database())) as current_db_size,
  pg_database_size(current_database()) / 1024 / 1024 / 1024.0 as size_gb;

\echo ''
\echo '📦 РАЗМЕРЫ ТАБЛИЦ ПОСЛЕ ОЧИСТКИ:'

SELECT
  tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('audit_log', 'ozon_sync', 'logs_ai', 'ai_reply_history', 'import_logs', 'ozon_sync_history')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

\echo ''
\echo '💡 СЛЕДУЮЩИЕ ШАГИ:'
\echo ''
\echo '1. Если база всё ещё в read-only режиме:'
\echo '   - Запустите: AUTO_CLEANUP_URGENT.sql (для агрессивной очистки)'
\echo '   - Подождите 3-5 часов'
\echo ''
\echo '2. Когда база вернется в нормальный режим:'
\echo '   - Остановите срочную очистку: SELECT cron.unschedule(''cleanup-audit-log-urgent'');'
\echo '   - Включите автоматическую очистку:'
\echo '     - supabase/migrations/20260119_auto_cleanup_audit_log.sql'
\echo '     - supabase/migrations/20260119_cleanup_ozon_sync_logs.sql'
\echo ''
\echo '3. Проверьте, что product_knowledge не затронут:'
\echo '   - SELECT COUNT(*) FROM public.product_knowledge;'
\echo ''
\echo '✅ ГОТОВО!'
