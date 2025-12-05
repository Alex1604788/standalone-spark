-- Add fields to marketplaces for sync status tracking
ALTER TABLE public.marketplaces
  ADD COLUMN IF NOT EXISTS ozon_seller_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_total INTEGER DEFAULT 0;

-- Create unique index for user + seller_id
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplaces_user_seller
  ON public.marketplaces (user_id, ozon_seller_id)
  WHERE ozon_seller_id IS NOT NULL;

-- Ensure unique constraint on products
DROP INDEX IF EXISTS ux_products_marketplace_external;
CREATE UNIQUE INDEX ux_products_marketplace_external
  ON public.products (marketplace_id, external_id);

-- Update reviews table: ensure marketplace_id exists
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS marketplace_id UUID;

-- Update marketplace_id for existing reviews based on product
UPDATE public.reviews r
SET marketplace_id = p.marketplace_id
FROM public.products p
WHERE r.product_id = p.id
  AND r.marketplace_id IS NULL;

-- Make marketplace_id NOT NULL after data migration
ALTER TABLE public.reviews
  ALTER COLUMN marketplace_id SET NOT NULL;

-- Add other review fields
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS raw JSONB,
  ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT NOW();

-- Drop and recreate foreign key as deferrable
ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_product_fk;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_product_fk
  FOREIGN KEY (product_id) REFERENCES public.products(id)
  DEFERRABLE INITIALLY DEFERRED;

-- Ensure unique constraint on reviews
DROP INDEX IF EXISTS ux_reviews_marketplace_external;
CREATE UNIQUE INDEX ux_reviews_marketplace_external
  ON public.reviews (marketplace_id, external_id);