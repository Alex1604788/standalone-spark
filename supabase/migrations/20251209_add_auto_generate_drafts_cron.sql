-- Cron job для автоматической генерации черновиков в фоновом режиме
-- Запускается каждые 5 минут для всех активных маркетплейсов

-- Удаляем существующий cron job, если есть
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-generate-drafts-cron') THEN
    PERFORM cron.unschedule('auto-generate-drafts-cron');
  END IF;
END $$;

-- Создаем cron job для автоматической генерации черновиков
-- Используем правильный project_id: bkmicyguzlwampuindff
-- Используем anon key (функция внутри использует service role key)
SELECT cron.schedule(
  'auto-generate-drafts-cron',
  '*/5 * * * *', -- Каждые 5 минут
  $$
  SELECT
    net.http_post(
      url:='https://bkmicyguzlwampuindff.supabase.co/functions/v1/auto-generate-drafts-cron',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

