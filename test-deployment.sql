-- ============================================================================
-- ПРОВЕРКА ДЕПЛОЯ: Тестирование применённых миграций
-- ============================================================================

-- 1. Проверка существования функции cleanup_old_reviews
SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'cleanup_old_reviews';

-- 2. Проверка параметров функции cleanup_old_reviews
SELECT
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname = 'cleanup_old_reviews'
  AND pronamespace = 'public'::regnamespace;

-- 3. Тестовый вызов функции (с параметром 0 чтобы ничего не удалить)
SELECT public.cleanup_old_reviews(9999) as test_result;

-- 4. Проверка cron задач (должен быть исправлен URL для process-scheduled-replies)
SELECT
  jobid,
  schedule,
  command,
  active
FROM cron.job
WHERE command LIKE '%process-scheduled-replies%'
ORDER BY jobid DESC
LIMIT 5;

-- 5. Проверка всех активных cron задач
SELECT
  jobid,
  schedule,
  command,
  active,
  jobname
FROM cron.job
WHERE active = true
ORDER BY jobid DESC;

-- 6. Проверка credentials (должны быть в API mode для Ozon Premium)
SELECT
  id,
  marketplace_type,
  mode,
  created_at
FROM marketplace_credentials
WHERE marketplace_type = 'ozon'
ORDER BY created_at DESC
LIMIT 5;
