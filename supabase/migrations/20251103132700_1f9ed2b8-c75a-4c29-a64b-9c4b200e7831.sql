-- Create ozon_credentials table to store API keys
CREATE TABLE IF NOT EXISTS public.ozon_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create unique index to ensure one credential per marketplace
CREATE UNIQUE INDEX IF NOT EXISTS ux_ozon_credentials_marketplace
ON public.ozon_credentials (marketplace_id);

-- Enable RLS
ALTER TABLE public.ozon_credentials ENABLE ROW LEVEL SECURITY;

-- Users can manage credentials for their own marketplaces
CREATE POLICY "Users can manage own marketplace credentials"
ON public.ozon_credentials
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.marketplaces m
    WHERE m.id = ozon_credentials.marketplace_id
    AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.marketplaces m
    WHERE m.id = ozon_credentials.marketplace_id
    AND m.user_id = auth.uid()
  )
);

-- Trigger to update updated_at
CREATE TRIGGER update_ozon_credentials_updated_at
BEFORE UPDATE ON public.ozon_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();