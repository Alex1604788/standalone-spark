-- Update cron job URLs to use correct project ID

-- Drop existing cron jobs
SELECT cron.unschedule('process-scheduled-replies');
SELECT cron.unschedule('sync-ozon-marketplaces');

-- Recreate cron job for processing scheduled replies with correct project ID
SELECT cron.schedule(
  'process-scheduled-replies',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url:='https://jnybwdisncvqmlacgrpr.supabase.co/functions/v1/process-scheduled-replies',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpueWJ3ZGlzbmN2cW1sYWNncnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0OTcxNjYsImV4cCI6MjA3NzA3MzE2Nn0.18wKRw6x1iuva7-X0wu0j-3CEaPoRivvu-JTrZ-2FFc"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Recreate cron job for Ozon sync with correct project ID
SELECT cron.schedule(
  'sync-ozon-marketplaces',
  '0 */2 * * *', -- Every 2 hours
  $$
  SELECT
    net.http_post(
        url:='https://jnybwdisncvqmlacgrpr.supabase.co/functions/v1/sync-ozon',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpueWJ3ZGlzbmN2cW1sYWNncnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0OTcxNjYsImV4cCI6MjA3NzA3MzE2Nn0.18wKRw6x1iuva7-X0wu0j-3CEaPoRivvu-JTrZ-2FFc"}'::jsonb,
        body:=jsonb_build_object('marketplace_id', m.id)
    ) as request_id
  FROM public.marketplaces m
  WHERE m.type = 'ozon' AND m.is_active = true;
  $$
);