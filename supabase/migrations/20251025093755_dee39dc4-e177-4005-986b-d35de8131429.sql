-- Add missing fields to existing tables

-- Add photos field to reviews table
ALTER TABLE public.reviews 
ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;

-- Add tone field to replies table
ALTER TABLE public.replies 
ADD COLUMN IF NOT EXISTS tone text DEFAULT 'friendly';

-- Ensure kill_switch_enabled exists in marketplaces (should already exist)
-- No action needed as it's already in schema

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_replies_status_scheduled 
ON public.replies (status, scheduled_at) 
WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_reviews_external_id 
ON public.reviews (external_id);

CREATE INDEX IF NOT EXISTS idx_questions_external_id 
ON public.questions (external_id);