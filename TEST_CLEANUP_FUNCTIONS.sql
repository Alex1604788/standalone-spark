-- =====================================================
-- ТЕСТИРОВАНИЕ ФУНКЦИЙ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Этот скрипт запускает все функции очистки для проверки
-- их работоспособности.
--
-- ВНИМАНИЕ: Этот скрипт УДАЛИТ старые записи из таблиц!
-- Убедитесь, что вы хотите выполнить очистку.
-- =====================================================

\echo '========================================='
\echo 'ТЕСТИРОВАНИЕ ФУНКЦИЙ ОЧИСТКИ'
\echo '========================================='

-- =====================================================
-- ПЕРЕД ТЕСТИРОВАНИЕМ: Показать текущее состояние
-- =====================================================

\echo ''
\echo '📊 СОСТОЯНИЕ ДО ОЧИСТКИ:'
\echo '-----------------------------------'

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  -- ai_reply_history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_reply_history') THEN
    SELECT COUNT(*) INTO v_count FROM public.ai_reply_history;
    RAISE NOTICE 'ai_reply_history: % записей', v_count;
  ELSE
    RAISE NOTICE 'ai_reply_history: таблица не существует';
  END IF;

  -- logs_ai
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_ai') THEN
    SELECT COUNT(*) INTO v_count FROM public.logs_ai;
    RAISE NOTICE 'logs_ai: % записей', v_count;
  ELSE
    RAISE NOTICE 'logs_ai: таблица не существует';
  END IF;

  -- import_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.import_logs;
    RAISE NOTICE 'import_logs: % записей', v_count;
  ELSE
    RAISE NOTICE 'import_logs: таблица не существует';
  END IF;

  -- ozon_sync_history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync_history') THEN
    SELECT COUNT(*) INTO v_count FROM public.ozon_sync_history;
    RAISE NOTICE 'ozon_sync_history: % записей', v_count;
  ELSE
    RAISE NOTICE 'ozon_sync_history: таблица не существует';
  END IF;

  -- cron.job_run_details
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    SELECT COUNT(*) INTO v_count FROM cron.job_run_details;
    RAISE NOTICE 'cron.job_run_details: % записей', v_count;
  ELSE
    RAISE NOTICE 'cron.job_run_details: таблица не существует';
  END IF;

  -- fallback_action_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fallback_action_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.fallback_action_logs;
    RAISE NOTICE 'fallback_action_logs: % записей', v_count;
  ELSE
    RAISE NOTICE 'fallback_action_logs: таблица не существует';
  END IF;

  -- consent_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consent_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.consent_logs;
    RAISE NOTICE 'consent_logs: % записей', v_count;
  ELSE
    RAISE NOTICE 'consent_logs: таблица не существует';
  END IF;
END $$;

-- =====================================================
-- ТЕСТ 1: cleanup_ai_reply_history (30 дней)
-- =====================================================

\echo ''
\echo '🧪 ТЕСТ 1/7: cleanup_ai_reply_history (30 дней)...'
\echo '-----------------------------------'

SELECT * FROM public.cleanup_ai_reply_history();

-- =====================================================
-- ТЕСТ 2: cleanup_logs_ai (7 дней)
-- =====================================================

\echo ''
\echo '🧪 ТЕСТ 2/7: cleanup_logs_ai (7 дней)...'
\echo '-----------------------------------'

SELECT * FROM public.cleanup_logs_ai();

-- =====================================================
-- ТЕСТ 3: cleanup_import_logs (7 дней)
-- =====================================================

\echo ''
\echo '🧪 ТЕСТ 3/7: cleanup_import_logs (7 дней)...'
\echo '-----------------------------------'

SELECT * FROM public.cleanup_import_logs();

-- =====================================================
-- ТЕСТ 4: cleanup_ozon_sync_history (30 дней)
-- =====================================================

\echo ''
\echo '🧪 ТЕСТ 4/7: cleanup_ozon_sync_history (30 дней)...'
\echo '-----------------------------------'

SELECT * FROM public.cleanup_ozon_sync_history();

-- =====================================================
-- ТЕСТ 5: cleanup_cron_job_run_details (7 дней)
-- =====================================================

\echo ''
\echo '🧪 ТЕСТ 5/7: cleanup_cron_job_run_details (7 дней)...'
\echo '-----------------------------------'

SELECT * FROM public.cleanup_cron_job_run_details();

-- =====================================================
-- ТЕСТ 6: cleanup_fallback_action_logs (7 дней)
-- =====================================================

\echo ''
\echo '🧪 ТЕСТ 6/7: cleanup_fallback_action_logs (7 дней)...'
\echo '-----------------------------------'

SELECT * FROM public.cleanup_fallback_action_logs();

-- =====================================================
-- ТЕСТ 7: cleanup_consent_logs (не хранить)
-- =====================================================

\echo ''
\echo '🧪 ТЕСТ 7/7: cleanup_consent_logs (не хранить)...'
\echo '-----------------------------------'

SELECT * FROM public.cleanup_consent_logs();

-- =====================================================
-- ПОСЛЕ ТЕСТИРОВАНИЯ: Показать результаты
-- =====================================================

\echo ''
\echo '📊 СОСТОЯНИЕ ПОСЛЕ ОЧИСТКИ:'
\echo '-----------------------------------'

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  -- ai_reply_history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_reply_history') THEN
    SELECT COUNT(*) INTO v_count FROM public.ai_reply_history;
    RAISE NOTICE 'ai_reply_history: % записей осталось', v_count;
  END IF;

  -- logs_ai
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_ai') THEN
    SELECT COUNT(*) INTO v_count FROM public.logs_ai;
    RAISE NOTICE 'logs_ai: % записей осталось', v_count;
  END IF;

  -- import_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.import_logs;
    RAISE NOTICE 'import_logs: % записей осталось', v_count;
  END IF;

  -- ozon_sync_history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync_history') THEN
    SELECT COUNT(*) INTO v_count FROM public.ozon_sync_history;
    RAISE NOTICE 'ozon_sync_history: % записей осталось', v_count;
  END IF;

  -- cron.job_run_details
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    SELECT COUNT(*) INTO v_count FROM cron.job_run_details;
    RAISE NOTICE 'cron.job_run_details: % записей осталось', v_count;
  END IF;

  -- fallback_action_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fallback_action_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.fallback_action_logs;
    RAISE NOTICE 'fallback_action_logs: % записей осталось', v_count;
  END IF;

  -- consent_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consent_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.consent_logs;
    RAISE NOTICE 'consent_logs: % записей осталось', v_count;
  END IF;
END $$;

\echo ''
\echo '========================================='
\echo '✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО'
\echo '========================================='
