-- Check if pg_cron is enabled and configured
-- Run this in Supabase SQL Editor

-- 1. Check if pg_cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- 2. Check all scheduled CRON jobs
SELECT
  jobid,
  schedule,
  command,
  jobname,
  nodename,
  nodeport,
  database,
  active
FROM cron.job
ORDER BY jobid;

-- 3. Check recent CRON job runs
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
