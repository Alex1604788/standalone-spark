-- СРОЧНАЯ ПРОВЕРКА: Что происходит с replies?

-- 1. Общее количество replies по статусам
SELECT
  status,
  COUNT(*) as count
FROM replies
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY count DESC;

-- 2. Когда были созданы эти replies (последние 1000)
SELECT
  DATE_TRUNC('minute', created_at) as created_minute,
  status,
  COUNT(*) as count
FROM replies
WHERE deleted_at IS NULL
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', created_at), status
ORDER BY created_minute DESC;

-- 3. Сколько replies для OZON маркетплейса
SELECT
  status,
  COUNT(*) as count
FROM replies
WHERE deleted_at IS NULL
  AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY status;

-- 4. Проверка дубликатов - есть ли reviews с множественными drafted replies?
SELECT
  review_id,
  COUNT(*) as replies_count
FROM replies
WHERE deleted_at IS NULL
  AND review_id IS NOT NULL
  AND status = 'drafted'
GROUP BY review_id
HAVING COUNT(*) > 1
ORDER BY replies_count DESC
LIMIT 10;

-- 5. СРОЧНО: Остановить автогенерацию если она запущена
-- Проверяем последний запуск auto-generate
SELECT
  jobid,
  jobname,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobname = 'auto-generate-drafts-cron'
ORDER BY start_time DESC
LIMIT 5;
