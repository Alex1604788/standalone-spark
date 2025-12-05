-- Create unique index for upsert by marketplace_id and external_id
CREATE UNIQUE INDEX IF NOT EXISTS products_marketplace_external_uidx 
ON public.products (marketplace_id, external_id);