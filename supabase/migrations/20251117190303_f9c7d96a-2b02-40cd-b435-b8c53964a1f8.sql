-- Add missing fields to products table for Ozon API v3/product/info/list
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS offer_id text,
ADD COLUMN IF NOT EXISTS description_category_id integer,
ADD COLUMN IF NOT EXISTS type_id integer,
ADD COLUMN IF NOT EXISTS image_urls jsonb DEFAULT '[]'::jsonb;

-- Add comments for new fields
COMMENT ON COLUMN products.offer_id IS 'Артикул товара (SKU продавца)';
COMMENT ON COLUMN products.description_category_id IS 'ID категории товара';
COMMENT ON COLUMN products.type_id IS 'ID типа товара';
COMMENT ON COLUMN products.image_urls IS 'Массив URL всех изображений товара';