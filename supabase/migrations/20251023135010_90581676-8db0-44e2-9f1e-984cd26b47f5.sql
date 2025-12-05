-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add unique constraint on reviews external_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'reviews_external_id_key'
  ) THEN
    ALTER TABLE public.reviews ADD CONSTRAINT reviews_external_id_key UNIQUE (external_id);
  END IF;
END $$;

-- Add unique constraint on questions external_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'questions_external_id_key'
  ) THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_external_id_key UNIQUE (external_id);
  END IF;
END $$;

-- Grant necessary permissions for RLS policies to insert/update
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Add policy for service role to insert/update reviews and questions
DROP POLICY IF EXISTS "Service role can manage reviews" ON public.reviews;
CREATE POLICY "Service role can manage reviews"
ON public.reviews
FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage questions" ON public.questions;
CREATE POLICY "Service role can manage questions"
ON public.questions
FOR ALL
USING (true)
WITH CHECK (true);

-- Schedule Ozon sync to run every 2 hours
-- This will sync all active Ozon marketplaces
SELECT cron.schedule(
  'sync-ozon-marketplaces',
  '0 */2 * * *', -- Every 2 hours
  $$
  SELECT
    net.http_post(
        url:='https://nxymhkyvhcfcwjcfcbfy.supabase.co/functions/v1/sync-ozon',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54eW1oa3l2aGNmY3dqY2ZjYmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNTEzOTIsImV4cCI6MjA3NDkyNzM5Mn0.CdYtuErUH78FzGjQca-MJriU8GpKmQ9wCniKqNqsmvY"}'::jsonb,
        body:=jsonb_build_object('marketplace_id', m.id)
    ) as request_id
  FROM public.marketplaces m
  WHERE m.type = 'ozon' AND m.is_active = true;
  $$
);
