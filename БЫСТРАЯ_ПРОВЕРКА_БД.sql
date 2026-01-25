-- =====================================================
-- БЫСТРАЯ ПРОВЕРКА БАЗЫ ДАННЫХ
-- =====================================================
-- Этот скрипт показывает текущее состояние БД
-- Выполнение: ~10-20 секунд
-- =====================================================

\echo '========================================='
\echo '📊 БЫСТРАЯ ПРОВЕРКА БАЗЫ ДАННЫХ'
\echo '========================================='
\echo ''

-- =====================================================
-- 1. ОБЩИЙ РАЗМЕР БАЗЫ ДАННЫХ
-- =====================================================

\echo '1️⃣  РАЗМЕР БАЗЫ ДАННЫХ:'
\echo '-----------------------------------'

SELECT
  current_database() as "База данных",
  pg_size_pretty(pg_database_size(current_database())) as "Размер";

\echo ''

-- =====================================================
-- 2. ТОП-10 САМЫХ БОЛЬШИХ ТАБЛИЦ
-- =====================================================

\echo '2️⃣  ТОП-10 САМЫХ БОЛЬШИХ ТАБЛИЦ:'
\echo '-----------------------------------'

SELECT
  tablename as "Таблица",
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as "Общий размер",
  pg_size_pretty(pg_relation_size('public.' || tablename)) as "Таблица",
  pg_size_pretty(pg_total_relation_size('public.' || tablename) - pg_relation_size('public.' || tablename)) as "Индексы"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC
LIMIT 10;

\echo ''

-- =====================================================
-- 3. СТАТУС АВТООЧИСТКИ
-- =====================================================

\echo '3️⃣  СТАТУС CRON ЗАДАЧ АВТООЧИСТКИ:'
\echo '-----------------------------------'

SELECT
  jobname as "Задача",
  CASE
    WHEN schedule = '0 3 * * 0' THEN 'Воскр 03:00'
    WHEN schedule = '0 4 * * 0' THEN 'Воскр 04:00'
    WHEN schedule = '0 5 * * *' THEN 'Ежедн 05:00'
    WHEN schedule = '30 5 * * *' THEN 'Ежедн 05:30'
    WHEN schedule = '0 6 * * 0' THEN 'Воскр 06:00'
    WHEN schedule = '0 6 * * *' THEN 'Ежедн 06:00'
    WHEN schedule = '30 6 * * *' THEN 'Ежедн 06:30'
    WHEN schedule = '0 7 * * *' THEN 'Ежедн 07:00'
    WHEN schedule = '0 2 1 * *' THEN '1-е число 02:00'
    ELSE schedule
  END as "Расписание",
  CASE WHEN active THEN '✅ Активна' ELSE '❌ Выключена' END as "Статус"
FROM cron.job
WHERE jobname LIKE 'cleanup-%'
ORDER BY jobname;

\echo ''

-- =====================================================
-- 4. ПОСЛЕДНИЕ ЗАПУСКИ ОЧИСТКИ
-- =====================================================

\echo '4️⃣  ПОСЛЕДНИЕ ЗАПУСКИ ОЧИСТКИ:'
\echo '-----------------------------------'

SELECT
  j.jobname as "Задача",
  d.status as "Статус",
  d.end_time as "Последний запуск",
  CASE
    WHEN d.end_time > NOW() - INTERVAL '1 day' THEN '✅ Недавно'
    WHEN d.end_time > NOW() - INTERVAL '7 days' THEN '⚠️  На этой неделе'
    WHEN d.end_time > NOW() - INTERVAL '30 days' THEN '⚠️  В этом месяце'
    WHEN d.end_time IS NULL THEN '❌ Никогда'
    ELSE '❌ Давно'
  END as "Актуальность"
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

-- =====================================================
-- 5. ТАБЛИЦЫ, ТРЕБУЮЩИЕ ВНИМАНИЯ
-- =====================================================

\echo '5️⃣  ТАБЛИЦЫ С БОЛЬШИМ КОЛИЧЕСТВОМ МЁРТВЫХ СТРОК:'
\echo '-----------------------------------'

SELECT
  schemaname as "Схема",
  tablename as "Таблица",
  n_live_tup as "Живых",
  n_dead_tup as "Мёртвых",
  ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as "% мёртвых",
  CASE
    WHEN ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) > 20 THEN '⚠️  Нужен VACUUM'
    ELSE '✅ OK'
  END as "Рекомендация"
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
  AND schemaname = 'public'
ORDER BY n_dead_tup DESC
LIMIT 10;

\echo ''

-- =====================================================
-- 6. ДОСТУПНЫЕ ФУНКЦИИ ОЧИСТКИ
-- =====================================================

\echo '6️⃣  ФУНКЦИИ АВТООЧИСТКИ:'
\echo '-----------------------------------'

SELECT
  routine_name as "Функция",
  CASE routine_name
    WHEN 'cleanup_ai_reply_history' THEN '30 дней'
    WHEN 'cleanup_logs_ai' THEN '7 дней'
    WHEN 'cleanup_import_logs' THEN '7 дней'
    WHEN 'cleanup_ozon_sync_history' THEN '30 дней'
    WHEN 'cleanup_cron_job_run_details' THEN '7 дней'
    WHEN 'cleanup_fallback_action_logs' THEN '7 дней'
    WHEN 'cleanup_consent_logs' THEN 'не хранить'
    WHEN 'cleanup_audit_log' THEN '90 дней'
    WHEN 'cleanup_storage_costs' THEN '6 месяцев'
    ELSE 'неизвестно'
  END as "Хранение",
  CASE
    WHEN routine_name IN ('cleanup_audit_log', 'cleanup_storage_costs') THEN '⭐ Новая'
    ELSE '✅ Ранее'
  END as "Статус"
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'cleanup_%'
ORDER BY routine_name;

\echo ''

-- =====================================================
-- 7. РЕКОМЕНДАЦИИ
-- =====================================================

\echo '========================================='
\echo '💡 РЕКОМЕНДАЦИИ:'
\echo '========================================='
\echo ''

DO $$
DECLARE
  v_db_size BIGINT;
  v_audit_log_exists BOOLEAN;
  v_storage_costs_exists BOOLEAN;
  v_replicas_size BIGINT;
BEGIN
  -- Проверяем размер БД
  SELECT pg_database_size(current_database()) INTO v_db_size;

  -- Проверяем наличие функций
  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'cleanup_audit_log'
  ) INTO v_audit_log_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'cleanup_storage_costs'
  ) INTO v_storage_costs_exists;

  -- Проверяем размер replicas
  SELECT COALESCE(pg_total_relation_size('public.replicas'), 0) INTO v_replicas_size;

  -- Выводим рекомендации
  RAISE NOTICE '';

  IF NOT v_audit_log_exists THEN
    RAISE NOTICE '⚠️  ВАЖНО: Не настроена автоочистка audit_log';
    RAISE NOTICE '   → Применить миграцию: 20260125120700_cleanup_audit_log.sql';
  ELSE
    RAISE NOTICE '✅ Настроена автоочистка audit_log (90 дней)';
  END IF;

  IF NOT v_storage_costs_exists THEN
    RAISE NOTICE '⚠️  ВАЖНО: Не настроена автоочистка storage_costs';
    RAISE NOTICE '   → Применить миграцию: 20260125120800_cleanup_storage_costs.sql';
  ELSE
    RAISE NOTICE '✅ Настроена автоочистка storage_costs (6 месяцев)';
  END IF;

  IF v_replicas_size > 100 * 1024 * 1024 THEN -- > 100 MB
    RAISE NOTICE '⚠️  ВНИМАНИЕ: Таблица replicas занимает %', pg_size_pretty(v_replicas_size);
    RAISE NOTICE '   → Выполнить диагностику: ДИАГНОСТИКА_REPLICAS.sql';
  END IF;

  IF v_db_size > 600 * 1024 * 1024 THEN -- > 600 MB
    RAISE NOTICE '⚠️  ВНИМАНИЕ: Размер БД больше 600 MB';
    RAISE NOTICE '   → Рекомендуется выполнить оптимизацию';
    RAISE NOTICE '   → См. ИНСТРУКЦИЯ_ОПТИМИЗАЦИЯ_БД.md';
  ELSE
    RAISE NOTICE '✅ Размер БД в норме (< 600 MB)';
  END IF;

  RAISE NOTICE '';
END $$;

\echo '========================================='
\echo '📚 ДОКУМЕНТАЦИЯ:'
\echo '========================================='
\echo '• Детальный анализ → РЕКОМЕНДАЦИИ_ОПТИМИЗАЦИЯ_БД.md'
\echo '• Инструкция → ИНСТРУКЦИЯ_ОПТИМИЗАЦИЯ_БД.md'
\echo '• Краткое резюме → РЕЗЮМЕ_ОПТИМИЗАЦИИ.md'
\echo '• Диагностика replicas → ДИАГНОСТИКА_REPLICAS.sql'
\echo '========================================='
\echo ''
