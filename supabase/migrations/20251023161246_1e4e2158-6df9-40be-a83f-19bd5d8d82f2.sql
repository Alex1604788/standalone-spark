-- Add fallback mode support with security measures

-- Add fallback_mode enum
CREATE TYPE fallback_mode AS ENUM ('disabled', 'browser_extension', 'headful_bot');

-- Add consent_status enum
CREATE TYPE consent_status AS ENUM ('pending', 'accepted', 'declined', 'revoked');

-- Update marketplaces table to include fallback settings
ALTER TABLE public.marketplaces
ADD COLUMN fallback_mode fallback_mode NOT NULL DEFAULT 'disabled',
ADD COLUMN fallback_enabled boolean DEFAULT false,
ADD COLUMN service_account_email text,
ADD COLUMN session_token_encrypted text,
ADD COLUMN session_expires_at timestamp with time zone,
ADD COLUMN last_fallback_action_at timestamp with time zone,
ADD COLUMN fallback_rate_limit integer DEFAULT 1, -- actions per 5 minutes
ADD COLUMN kill_switch_enabled boolean DEFAULT false;

-- Create consent_logs table for e-consent tracking
CREATE TABLE public.consent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marketplace_id uuid REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  consent_type text NOT NULL, -- 'fallback_mode_browser_extension' or 'fallback_mode_headful_bot'
  status consent_status NOT NULL DEFAULT 'pending',
  consent_text text NOT NULL,
  ip_address text,
  user_agent text,
  accepted_at timestamp with time zone,
  declined_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Create fallback_action_logs table for audit trail
CREATE TABLE public.fallback_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marketplace_id uuid NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  action_type text NOT NULL, -- 'read_review', 'post_reply', 'login', 'captcha_detected', etc.
  status text NOT NULL, -- 'success', 'failed', 'blocked_by_kill_switch', 'rate_limited'
  details jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fallback_action_logs ENABLE ROW LEVEL SECURITY;

-- Policies for consent_logs
CREATE POLICY "Users can view their own consent logs"
ON public.consent_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own consent logs"
ON public.consent_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own consent logs"
ON public.consent_logs FOR UPDATE
USING (auth.uid() = user_id);

-- Policies for fallback_action_logs
CREATE POLICY "Users can view their own fallback action logs"
ON public.fallback_action_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can create fallback action logs"
ON public.fallback_action_logs FOR INSERT
WITH CHECK (true); -- Will be restricted by service role

-- Create function to check rate limit
CREATE OR REPLACE FUNCTION public.check_fallback_rate_limit(
  p_marketplace_id uuid,
  p_rate_limit integer DEFAULT 1
) RETURNS boolean AS $$
DECLARE
  v_action_count integer;
BEGIN
  -- Count actions in last 5 minutes
  SELECT COUNT(*)
  INTO v_action_count
  FROM public.fallback_action_logs
  WHERE marketplace_id = p_marketplace_id
    AND created_at > NOW() - INTERVAL '5 minutes'
    AND status IN ('success', 'failed');
  
  RETURN v_action_count < p_rate_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to log fallback action
CREATE OR REPLACE FUNCTION public.log_fallback_action(
  p_user_id uuid,
  p_marketplace_id uuid,
  p_action_type text,
  p_status text,
  p_details jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.fallback_action_logs (
    user_id,
    marketplace_id,
    action_type,
    status,
    details,
    error_message
  ) VALUES (
    p_user_id,
    p_marketplace_id,
    p_action_type,
    p_status,
    p_details,
    p_error_message
  ) RETURNING id INTO v_log_id;
  
  -- Update last action timestamp
  UPDATE public.marketplaces
  SET last_fallback_action_at = NOW()
  WHERE id = p_marketplace_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;