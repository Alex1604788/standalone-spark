-- Удаляем дублирующий внешний ключ между reviews и products
-- Оставляем только reviews_product_id_fkey, удаляем reviews_product_fk
ALTER TABLE public.reviews 
DROP CONSTRAINT IF EXISTS reviews_product_fk;