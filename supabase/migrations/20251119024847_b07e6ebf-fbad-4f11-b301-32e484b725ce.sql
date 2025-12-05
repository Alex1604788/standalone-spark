-- Add unique constraint to prevent duplicate products
ALTER TABLE public.products 
ADD CONSTRAINT products_marketplace_external_id_unique 
UNIQUE (marketplace_id, external_id);