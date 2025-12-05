-- Add missing columns to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sku text,
ADD COLUMN IF NOT EXISTS brand text;

-- Create unique index for upsert by marketplace_id and external_id
CREATE UNIQUE INDEX IF NOT EXISTS products_marketplace_ext_uidx 
ON public.products (marketplace_id, external_id);

-- Ensure marketplaces has sync logging columns (should already exist from previous migration)
ALTER TABLE public.marketplaces
ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_sync_status text,
ADD COLUMN IF NOT EXISTS last_sync_error text;