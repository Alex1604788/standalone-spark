-- ============================================
-- CRON Job for Publishing Scheduled Replies
-- Date: 2026-01-12
-- ============================================
-- This CRON job processes scheduled replies every 10 minutes
-- Works with all marketplaces including OZON API mode
--
-- ⚠️ IMPORTANT: Requires pg_cron and pg_net extensions
-- Enable in Supabase Dashboard → Database → Extensions
-- ============================================

-- Remove existing CRON job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-replies-every-10min') THEN
    PERFORM cron.unschedule('process-scheduled-replies-every-10min');
  END IF;
END $$;

-- Create CRON job to process scheduled replies every 10 minutes
SELECT cron.schedule(
  'process-scheduled-replies-every-10min',
  '*/10 * * * *', -- Every 10 minutes
  $$
  SELECT
    net.http_post(
      url:='https://bkmicyguzlwampuindff.supabase.co/functions/v1/process-scheduled-replies',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Verify CRON job was created
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'process-scheduled-replies-every-10min';

-- ============================================
-- DONE!
-- ============================================
-- To check CRON job status:
-- SELECT * FROM cron.job WHERE jobname = 'process-scheduled-replies-every-10min';
--
-- To check recent runs:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-scheduled-replies-every-10min')
-- ORDER BY start_time DESC LIMIT 10;
--
-- To manually unschedule:
-- SELECT cron.unschedule('process-scheduled-replies-every-10min');
-- ============================================
