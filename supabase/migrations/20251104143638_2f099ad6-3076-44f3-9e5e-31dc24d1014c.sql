-- Add timestamp fields for connection check and synchronization tracking
ALTER TABLE public.marketplaces ADD COLUMN IF NOT EXISTS last_check_at timestamptz;
ALTER TABLE public.marketplaces ADD COLUMN IF NOT EXISTS last_sync_products_at timestamptz;
ALTER TABLE public.marketplaces ADD COLUMN IF NOT EXISTS last_sync_reviews_at timestamptz;