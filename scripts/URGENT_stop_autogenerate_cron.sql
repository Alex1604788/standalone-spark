-- СРОЧНОЕ ДЕЙСТВИЕ: Остановить все CRON задачи автогенерации

-- 1. Остановить auto-generate-drafts-cron
SELECT cron.unschedule('auto-generate-drafts-cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-generate-drafts-cron');

-- 2. Проверить что задача остановлена
SELECT
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname = 'auto-generate-drafts-cron';

-- Если задача все еще active = true, значит она не остановилась
-- Нужно будет остановить вручную через Supabase Dashboard
