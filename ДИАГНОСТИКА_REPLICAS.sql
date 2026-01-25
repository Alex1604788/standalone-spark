-- =====================================================
-- ДИАГНОСТИКА ТАБЛИЦЫ REPLICAS
-- =====================================================
-- Эта таблица занимает 337 MB - самую большую часть БД
-- Нужно понять, что это за таблица и можно ли её оптимизировать
-- =====================================================

\echo '========================================='
\echo 'ДИАГНОСТИКА ТАБЛИЦЫ REPLICAS (337 MB)'
\echo '========================================='

-- =====================================================
-- 1. ОБЩАЯ ИНФОРМАЦИЯ О ТАБЛИЦЕ
-- =====================================================

\echo ''
\echo '📋 1. ИНФОРМАЦИЯ О ТАБЛИЦЕ:'
\echo '-----------------------------------'

SELECT
  schemaname as "Схема",
  tablename as "Таблица",
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS "Общий размер",
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS "Размер таблицы",
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS "Размер индексов"
FROM pg_tables
WHERE tablename = 'replicas';

-- =====================================================
-- 2. СТРУКТУРА ТАБЛИЦЫ
-- =====================================================

\echo ''
\echo '📋 2. СТРУКТУРА ТАБЛИЦЫ:'
\echo '-----------------------------------'

\d+ replicas

-- =====================================================
-- 3. КОЛИЧЕСТВО ЗАПИСЕЙ
-- =====================================================

\echo ''
\echo '📋 3. КОЛИЧЕСТВО ЗАПИСЕЙ:'
\echo '-----------------------------------'

DO $$
DECLARE
  v_count BIGINT;
  v_schema TEXT;
  v_table_exists BOOLEAN;
BEGIN
  -- Проверяем существование таблицы
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'replicas'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'Таблица replicas не найдена';
    RETURN;
  END IF;

  -- Получаем схему
  SELECT schemaname INTO v_schema
  FROM pg_tables
  WHERE tablename = 'replicas';

  -- Подсчитываем записи
  EXECUTE format('SELECT COUNT(*) FROM %I.replicas', v_schema) INTO v_count;

  RAISE NOTICE 'Всего записей в replicas: %', v_count;
END $$;

-- =====================================================
-- 4. ИНДЕКСЫ ТАБЛИЦЫ
-- =====================================================

\echo ''
\echo '📋 4. ИНДЕКСЫ ТАБЛИЦЫ:'
\echo '-----------------------------------'

SELECT
  indexname as "Индекс",
  pg_size_pretty(pg_relation_size(indexrelid)) AS "Размер индекса",
  idx_scan as "Количество сканирований",
  idx_tup_read as "Прочитано строк",
  idx_tup_fetch as "Получено строк"
FROM pg_stat_user_indexes
WHERE tablename = 'replicas'
ORDER BY pg_relation_size(indexrelid) DESC;

-- =====================================================
-- 5. ПРОВЕРКА: ЭТО СИСТЕМНАЯ ТАБЛИЦА POSTGRES?
-- =====================================================

\echo ''
\echo '📋 5. ПРОВЕРКА ТИПА ТАБЛИЦЫ:'
\echo '-----------------------------------'

SELECT
  CASE
    WHEN schemaname = 'pg_catalog' THEN 'Системная таблица PostgreSQL'
    WHEN schemaname = 'information_schema' THEN 'Системная таблица Information Schema'
    WHEN schemaname = 'public' THEN 'Пользовательская таблица'
    WHEN schemaname LIKE 'pg_%' THEN 'Системная таблица PostgreSQL'
    ELSE 'Таблица схемы: ' || schemaname
  END as "Тип таблицы"
FROM pg_tables
WHERE tablename = 'replicas';

-- =====================================================
-- 6. ПРОВЕРКА: ЭТО ТАБЛИЦА LOGICAL REPLICATION?
-- =====================================================

\echo ''
\echo '📋 6. ПРОВЕРКА LOGICAL REPLICATION:'
\echo '-----------------------------------'

-- Проверяем publication
SELECT
  pubname as "Publication",
  puballtables as "Все таблицы?"
FROM pg_publication;

-- Проверяем subscription
SELECT
  subname as "Subscription",
  subpublications as "Publications",
  subenabled as "Включена?"
FROM pg_subscription;

-- =====================================================
-- 7. ПЕРВЫЕ 10 ЗАПИСЕЙ (SAMPLE)
-- =====================================================

\echo ''
\echo '📋 7. ПРИМЕРЫ ЗАПИСЕЙ (первые 10):'
\echo '-----------------------------------'

DO $$
DECLARE
  v_schema TEXT;
  v_table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'replicas'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    SELECT schemaname INTO v_schema
    FROM pg_tables
    WHERE tablename = 'replicas';

    RAISE NOTICE 'Выполняем SELECT * FROM %.replicas LIMIT 10', v_schema;
    -- Выполняем запрос через EXECUTE, чтобы показать результаты
    EXECUTE format('SELECT * FROM %I.replicas LIMIT 10', v_schema);
  ELSE
    RAISE NOTICE 'Таблица replicas не найдена';
  END IF;
END $$;

-- =====================================================
-- 8. ПРОВЕРКА: ВОЗМОЖНО ЭТО SUPABASE REALTIME?
-- =====================================================

\echo ''
\echo '📋 8. ПРОВЕРКА SUPABASE REALTIME:'
\echo '-----------------------------------'

SELECT
  schemaname,
  tablename
FROM pg_tables
WHERE schemaname IN ('realtime', '_realtime', 'supabase_realtime')
  AND tablename LIKE '%replica%';

-- =====================================================
-- 9. СТАТИСТИКА DEAD TUPLES (МЁРТВЫЕ СТРОКИ)
-- =====================================================

\echo ''
\echo '📋 9. СТАТИСТИКА МЁРТВЫХ СТРОК:'
\echo '-----------------------------------'

SELECT
  schemaname as "Схема",
  tablename as "Таблица",
  n_live_tup as "Живых строк",
  n_dead_tup as "Мёртвых строк",
  n_mod_since_analyze as "Изменений с последнего ANALYZE",
  last_vacuum as "Последний VACUUM",
  last_autovacuum as "Последний AUTOVACUUM",
  last_analyze as "Последний ANALYZE",
  last_autoanalyze as "Последний AUTOANALYZE"
FROM pg_stat_user_tables
WHERE tablename = 'replicas';

-- =====================================================
-- РЕКОМЕНДАЦИИ
-- =====================================================

\echo ''
\echo '========================================='
\echo '💡 РЕКОМЕНДАЦИИ:'
\echo '========================================='
\echo ''
\echo '1. Если таблица replicas находится в схеме public:'
\echo '   - Это пользовательская таблица, можно проанализировать и оптимизировать'
\echo ''
\echo '2. Если таблица replicas находится в системной схеме (pg_*, realtime):'
\echo '   - Это системная таблица Supabase/PostgreSQL'
\echo '   - НЕ УДАЛЯТЬ и НЕ ИЗМЕНЯТЬ без консультации с support'
\echo ''
\echo '3. Если много мёртвых строк (n_dead_tup):'
\echo '   - Выполнить VACUUM FULL для сжатия'
\echo '   - Команда: VACUUM FULL replicas;'
\echo ''
\echo '4. Если это таблица Logical Replication:'
\echo '   - Проверить, нужна ли репликация'
\echo '   - Возможно, старые данные можно очистить'
\echo ''
\echo '========================================='
