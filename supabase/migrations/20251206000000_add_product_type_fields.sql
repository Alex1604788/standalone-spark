-- Add product_type and product_subtype fields to product_business_data
-- These fields are used for product hierarchy: Supplier → Type → Subtype → Product

ALTER TABLE public.product_business_data
ADD COLUMN IF NOT EXISTS product_type TEXT,
ADD COLUMN IF NOT EXISTS product_subtype TEXT;

COMMENT ON COLUMN public.product_business_data.product_type IS 'Вид номенклатуры (для иерархии: Поставщик → Вид → Подвид → Товар)';
COMMENT ON COLUMN public.product_business_data.product_subtype IS 'Подвид номенклатуры';
