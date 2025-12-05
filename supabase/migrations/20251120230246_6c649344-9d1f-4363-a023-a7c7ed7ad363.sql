-- Add unique constraints for upsert operations
ALTER TABLE public.products
  ADD CONSTRAINT products_marketplace_ext_unique
  UNIQUE (marketplace_id, external_id);

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_marketplace_ext_unique
  UNIQUE (marketplace_id, external_id);

ALTER TABLE public.questions
  ADD CONSTRAINT questions_marketplace_ext_unique
  UNIQUE (marketplace_id, external_id);