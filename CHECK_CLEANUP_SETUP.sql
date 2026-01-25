-- =====================================================
-- ПРОВЕРКА НАСТРОЙКИ СИСТЕМЫ АВТОМАТИЧЕСКОЙ ОЧИСТКИ
-- =====================================================
-- Этот скрипт проверяет:
-- 1. Созданные функции очистки
-- 2. Настроенные CRON задачи
-- 3. Размер таблиц с логами
-- =====================================================

\echo '========================================='
\echo 'ПРОВЕРКА СИСТЕМЫ АВТОМАТИЧЕСКОЙ ОЧИСТКИ'
\echo '========================================='

-- =====================================================
-- 1. ПРОВЕРКА ФУНКЦИЙ ОЧИСТКИ
-- =====================================================

\echo ''
\echo '📋 1. СОЗДАННЫЕ ФУНКЦИИ ОЧИСТКИ:'
\echo '-----------------------------------'

SELECT
  routine_name as "Функция",
  routine_type as "Тип",
  CASE
    WHEN routine_name = 'cleanup_ai_reply_history' THEN '30 дней'
    WHEN routine_name = 'cleanup_logs_ai' THEN '7 дней'
    WHEN routine_name = 'cleanup_import_logs' THEN '7 дней'
    WHEN routine_name = 'cleanup_ozon_sync_history' THEN '30 дней'
    WHEN routine_name = 'cleanup_cron_job_run_details' THEN '7 дней'
    WHEN routine_name = 'cleanup_fallback_action_logs' THEN '7 дней'
    WHEN routine_name = 'cleanup_consent_logs' THEN 'не хранить'
    ELSE 'неизвестно'
  END as "Период хранения"
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'cleanup_%'
ORDER BY routine_name;

-- =====================================================
-- 2. ПРОВЕРКА CRON ЗАДАЧ
-- =====================================================

\echo ''
\echo '📋 2. НАСТРОЕННЫЕ CRON ЗАДАЧИ:'
\echo '-----------------------------------'

SELECT
  jobname as "Название задачи",
  schedule as "Расписание (cron)",
  CASE schedule
    WHEN '0 4 * * 0' THEN 'Воскресенье 04:00 UTC'
    WHEN '0 5 * * *' THEN 'Ежедневно 05:00 UTC'
    WHEN '30 5 * * *' THEN 'Ежедневно 05:30 UTC'
    WHEN '0 6 * * 0' THEN 'Воскресенье 06:00 UTC'
    WHEN '0 6 * * *' THEN 'Ежедневно 06:00 UTC'
    WHEN '30 6 * * *' THEN 'Ежедневно 06:30 UTC'
    WHEN '0 7 * * *' THEN 'Ежедневно 07:00 UTC'
    ELSE schedule
  END as "Расписание (читаемое)",
  active as "Активна",
  jobid as "ID"
FROM cron.job
WHERE jobname LIKE 'cleanup-%'
ORDER BY jobname;

-- =====================================================
-- 3. РАЗМЕР ТАБЛИЦ С ЛОГАМИ
-- =====================================================

\echo ''
\echo '📋 3. ТЕКУЩИЙ РАЗМЕР ТАБЛИЦ С ЛОГАМИ:'
\echo '-----------------------------------'

SELECT
  tablename as "Таблица",
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as "Размер",
  (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) as "Записей (примерно)"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_reply_history',
    'logs_ai',
    'import_logs',
    'ozon_sync_history',
    'fallback_action_logs',
    'consent_logs'
  )
ORDER BY pg_total_relation_size('public.' || tablename) DESC;

-- Также проверяем cron.job_run_details
\echo ''
SELECT
  'cron.job_run_details' as "Таблица",
  pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as "Размер";

-- =====================================================
-- 4. КОЛИЧЕСТВО ЗАПИСЕЙ В ТАБЛИЦАХ
-- =====================================================

\echo ''
\echo '📋 4. КОЛИЧЕСТВО ЗАПИСЕЙ В ТАБЛИЦАХ:'
\echo '-----------------------------------'

DO $$
DECLARE
  v_count BIGINT;
  v_table TEXT;
  v_old_count BIGINT;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'Таблица                     | Всего записей | Старых (подлежащих удалению)';
  RAISE NOTICE '----------------------------+---------------+-----------------------------';

  -- ai_reply_history (30 дней)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_reply_history') THEN
    SELECT COUNT(*) INTO v_count FROM public.ai_reply_history;
    SELECT COUNT(*) INTO v_old_count FROM public.ai_reply_history WHERE created_at < NOW() - INTERVAL '30 days';
    RAISE NOTICE 'ai_reply_history            | %           | % (> 30 дней)', LPAD(v_count::TEXT, 13), LPAD(v_old_count::TEXT, 27);
  END IF;

  -- logs_ai (7 дней)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logs_ai') THEN
    SELECT COUNT(*) INTO v_count FROM public.logs_ai;
    SELECT COUNT(*) INTO v_old_count FROM public.logs_ai WHERE created_at < NOW() - INTERVAL '7 days';
    RAISE NOTICE 'logs_ai                     | %           | % (> 7 дней)', LPAD(v_count::TEXT, 13), LPAD(v_old_count::TEXT, 27);
  END IF;

  -- import_logs (7 дней)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'import_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.import_logs;
    SELECT COUNT(*) INTO v_old_count FROM public.import_logs WHERE created_at < NOW() - INTERVAL '7 days';
    RAISE NOTICE 'import_logs                 | %           | % (> 7 дней)', LPAD(v_count::TEXT, 13), LPAD(v_old_count::TEXT, 27);
  END IF;

  -- ozon_sync_history (30 дней)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ozon_sync_history') THEN
    SELECT COUNT(*) INTO v_count FROM public.ozon_sync_history;
    SELECT COUNT(*) INTO v_old_count FROM public.ozon_sync_history WHERE started_at < NOW() - INTERVAL '30 days';
    RAISE NOTICE 'ozon_sync_history           | %           | % (> 30 дней)', LPAD(v_count::TEXT, 13), LPAD(v_old_count::TEXT, 27);
  END IF;

  -- cron.job_run_details (7 дней)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
    SELECT COUNT(*) INTO v_count FROM cron.job_run_details;
    SELECT COUNT(*) INTO v_old_count FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '7 days';
    RAISE NOTICE 'cron.job_run_details        | %           | % (> 7 дней)', LPAD(v_count::TEXT, 13), LPAD(v_old_count::TEXT, 27);
  END IF;

  -- fallback_action_logs (7 дней)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fallback_action_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.fallback_action_logs;
    SELECT COUNT(*) INTO v_old_count FROM public.fallback_action_logs WHERE created_at < NOW() - INTERVAL '7 days';
    RAISE NOTICE 'fallback_action_logs        | %           | % (> 7 дней)', LPAD(v_count::TEXT, 13), LPAD(v_old_count::TEXT, 27);
  END IF;

  -- consent_logs (не хранить - удалять всё)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consent_logs') THEN
    SELECT COUNT(*) INTO v_count FROM public.consent_logs;
    RAISE NOTICE 'consent_logs                | %           | % (все)', LPAD(v_count::TEXT, 13), LPAD(v_count::TEXT, 27);
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- 5. ПОСЛЕДНИЕ ЗАПУСКИ CRON ЗАДАЧ
-- =====================================================

\echo ''
\echo '📋 5. ПОСЛЕДНИЕ ЗАПУСКИ CRON ЗАДАЧ ОЧИСТКИ:'
\echo '-----------------------------------'

SELECT
  j.jobname as "Задача",
  d.status as "Статус",
  d.start_time as "Начало",
  d.end_time as "Конец",
  EXTRACT(EPOCH FROM (d.end_time - d.start_time)) as "Время (сек)",
  LEFT(d.return_message, 100) as "Сообщение"
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT *
  FROM cron.job_run_details
  WHERE jobid = j.jobid
  ORDER BY end_time DESC
  LIMIT 1
) d ON true
WHERE j.jobname LIKE 'cleanup-%'
ORDER BY j.jobname;

\echo ''
\echo '========================================='
\echo '✅ ПРОВЕРКА ЗАВЕРШЕНА'
\echo '========================================='
