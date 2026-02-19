-- Fix cron job for process-scheduled-replies
-- VERSION: 2026-02-19-v1
--
-- ПРОБЛЕМА: Cron job 'process-scheduled-replies' указывал на старый Supabase проект
-- (jnybwdisncvqmlacgrpr или nxymhkyvhcfcwjcfcbfy), а не на текущий (bkmicyguzlwampuindff).
-- Из-за этого запланированные ответы никогда не публиковались автоматически,
-- и счётчик "Ожидают публикации" никогда не обнулялся.

-- Удаляем старый cron job
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-replies') THEN
    PERFORM cron.unschedule('process-scheduled-replies');
    RAISE NOTICE 'Removed old process-scheduled-replies cron job';
  END IF;
END $$;

-- Создаём новый cron job с правильным URL текущего проекта
SELECT cron.schedule(
  'process-scheduled-replies',
  '* * * * *', -- Каждую минуту
  $$
  SELECT
    net.http_post(
      url:='https://bkmicyguzlwampuindff.supabase.co/functions/v1/process-scheduled-replies',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Проверяем что cron job создан успешно
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname = 'process-scheduled-replies';
