-- Create table for Ozon UI pairing connections
CREATE TABLE IF NOT EXISTS public.ozon_ui_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pairing_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending_ui_pairing' CHECK (status IN ('pending_ui_pairing', 'active_ui', 'expired')),
  verified_email text,
  ozon_seller_id text,
  marketplace_id uuid REFERENCES public.marketplaces(id) ON DELETE SET NULL,
  last_sync_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ozon_ui_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections
CREATE POLICY "Users can view own connections"
  ON public.ozon_ui_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own connections
CREATE POLICY "Users can create own connections"
  ON public.ozon_ui_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own connections
CREATE POLICY "Users can update own connections"
  ON public.ozon_ui_connections
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can manage all connections
CREATE POLICY "Service role can manage all connections"
  ON public.ozon_ui_connections
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster pairing code lookups
CREATE INDEX idx_ozon_ui_connections_pairing_code ON public.ozon_ui_connections(pairing_code);
CREATE INDEX idx_ozon_ui_connections_user_id ON public.ozon_ui_connections(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_ozon_ui_connections_updated_at
  BEFORE UPDATE ON public.ozon_ui_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate 6-digit pairing code
CREATE OR REPLACE FUNCTION public.generate_pairing_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    -- Generate 6-digit code
    v_code := lpad(floor(random() * 1000000)::text, 6, '0');
    
    -- Check if code already exists
    SELECT EXISTS(
      SELECT 1 FROM public.ozon_ui_connections 
      WHERE pairing_code = v_code 
      AND status = 'pending_ui_pairing'
      AND expires_at > now()
    ) INTO v_exists;
    
    -- If code doesn't exist, return it
    IF NOT v_exists THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;