-- Add app_role enum if not exists (already exists based on context)
-- Add mode enum for replies
DO $$ BEGIN
  CREATE TYPE reply_mode AS ENUM ('manual', 'semi_auto', 'auto');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update replies table to add cancel functionality and better tracking
ALTER TABLE replies 
  ADD COLUMN IF NOT EXISTS can_cancel_until timestamptz,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Update status enum to match requirements
ALTER TYPE reply_status ADD VALUE IF NOT EXISTS 'retried';

-- Add analytics table for tracking metrics
CREATE TABLE IF NOT EXISTS public.analytics_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  metric_date date NOT NULL,
  total_reviews integer DEFAULT 0,
  total_questions integer DEFAULT 0,
  answered_reviews integer DEFAULT 0,
  answered_questions integer DEFAULT 0,
  avg_response_time_minutes integer DEFAULT 0,
  rating_change numeric(3,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, metric_date)
);

ALTER TABLE public.analytics_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for analytics
CREATE POLICY "Users can view own analytics" ON public.analytics_metrics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert analytics" ON public.analytics_metrics
  FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update analytics" ON public.analytics_metrics
  FOR UPDATE USING (true);

-- Add function to update analytics
CREATE OR REPLACE FUNCTION public.update_analytics_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.analytics_metrics (user_id, metric_date, total_reviews, answered_reviews)
  SELECT 
    m.user_id,
    CURRENT_DATE,
    COUNT(r.id),
    COUNT(r.id) FILTER (WHERE r.is_answered = true)
  FROM marketplaces m
  LEFT JOIN products p ON p.marketplace_id = m.id
  LEFT JOIN reviews r ON r.product_id = p.id
  GROUP BY m.user_id
  ON CONFLICT (user_id, metric_date) 
  DO UPDATE SET
    total_reviews = EXCLUDED.total_reviews,
    answered_reviews = EXCLUDED.answered_reviews,
    updated_at = now();
END;
$$;

-- Add trigger for updating timestamps on analytics
CREATE TRIGGER update_analytics_metrics_updated_at
  BEFORE UPDATE ON public.analytics_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add settings table for user preferences
CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  auto_reply_enabled boolean DEFAULT false,
  semi_auto_mode boolean DEFAULT true,
  require_approval_low_rating boolean DEFAULT true,
  telegram_notifications boolean DEFAULT false,
  telegram_chat_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for settings
CREATE POLICY "Users can manage own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add trigger for user_settings
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();