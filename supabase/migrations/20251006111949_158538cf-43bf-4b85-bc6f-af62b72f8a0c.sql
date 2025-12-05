-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to process scheduled replies every minute
SELECT cron.schedule(
  'process-scheduled-replies',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url:='https://nxymhkyvhcfcwjcfcbfy.supabase.co/functions/v1/process-scheduled-replies',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54eW1oa3l2aGNmY3dqY2ZjYmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNTEzOTIsImV4cCI6MjA3NDkyNzM5Mn0.CdYtuErUH78FzGjQca-MJriU8GpKmQ9wCniKqNqsmvY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);