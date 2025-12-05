-- Add missing fields to products table for Ozon API integration
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS barcodes text,
ADD COLUMN IF NOT EXISTS currency_code text,
ADD COLUMN IF NOT EXISTS marketing_price numeric,
ADD COLUMN IF NOT EXISTS min_price numeric,
ADD COLUMN IF NOT EXISTS old_price numeric,
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_discounted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_kgt boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_super boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_seasonal boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS vat text,
ADD COLUMN IF NOT EXISTS volume_weight numeric,
ADD COLUMN IF NOT EXISTS commissions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS stocks jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS statuses jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS price_indexes jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS sources jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS model_info jsonb,
ADD COLUMN IF NOT EXISTS promotions jsonb DEFAULT '[]'::jsonb;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_products_is_archived ON public.products(is_archived);
CREATE INDEX IF NOT EXISTS idx_products_currency_code ON public.products(currency_code);
CREATE INDEX IF NOT EXISTS idx_products_is_discounted ON public.products(is_discounted);