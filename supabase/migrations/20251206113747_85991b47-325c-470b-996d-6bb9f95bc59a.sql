-- Пересчитываем segment для ВСЕХ отзывов, где он NULL или неправильный
UPDATE reviews r
SET segment = public.calculate_review_segment(r.id)
WHERE segment IS NULL 
   OR segment != public.calculate_review_segment(r.id);