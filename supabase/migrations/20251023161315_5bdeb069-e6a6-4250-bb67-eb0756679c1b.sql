-- Fix search_path for fallback functions

DROP FUNCTION IF EXISTS public.check_fallback_rate_limit(uuid, integer);
DROP FUNCTION IF EXISTS public.log_fallback_action(uuid, uuid, text, text, jsonb, text);

-- Recreate with proper search_path
CREATE OR REPLACE FUNCTION public.check_fallback_rate_limit(
  p_marketplace_id uuid,
  p_rate_limit integer DEFAULT 1
) RETURNS boolean AS $$
DECLARE
  v_action_count integer;
BEGIN
  SELECT COUNT(*)
  INTO v_action_count
  FROM public.fallback_action_logs
  WHERE marketplace_id = p_marketplace_id
    AND created_at > NOW() - INTERVAL '5 minutes'
    AND status IN ('success', 'failed');
  
  RETURN v_action_count < p_rate_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  
  UPDATE public.marketplaces
  SET last_fallback_action_at = NOW()
  WHERE id = p_marketplace_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;