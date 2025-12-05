-- Add external_id to products if not exists
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS external_id text;

-- Create unique index for products (marketplace_id + external_id)
CREATE UNIQUE INDEX IF NOT EXISTS products_marketplace_external_uidx
ON public.products(marketplace_id, external_id);

-- Create unique index for reviews external_id
CREATE UNIQUE INDEX IF NOT EXISTS reviews_external_uidx
ON public.reviews(external_id);

-- Create unique index for questions external_id
CREATE UNIQUE INDEX IF NOT EXISTS questions_external_uidx
ON public.questions(external_id);

-- Ensure photos column in reviews is jsonb with default []
ALTER TABLE public.reviews 
ALTER COLUMN photos SET DEFAULT '[]'::jsonb;