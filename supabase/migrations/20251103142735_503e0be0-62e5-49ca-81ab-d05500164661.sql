-- Ensure unique credential per marketplace
CREATE UNIQUE INDEX IF NOT EXISTS ux_ozon_credentials_marketplace
ON public.ozon_credentials (marketplace_id);