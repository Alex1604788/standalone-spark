-- Обновляем политику для reviews: добавляем проверку через marketplace_id
DROP POLICY IF EXISTS "Users can view reviews from own products" ON public.reviews;

CREATE POLICY "Users can view reviews from own products" 
ON public.reviews 
FOR SELECT 
USING (
  -- Вариант 1: проверка через products.product_id (старый способ)
  (EXISTS ( 
    SELECT 1
    FROM (products p JOIN marketplaces m ON ((m.id = p.marketplace_id)))
    WHERE ((p.id = reviews.product_id) AND (m.user_id = auth.uid()))
  ))
  OR
  -- Вариант 2: прямая проверка через reviews.marketplace_id (новый способ)
  (EXISTS ( 
    SELECT 1
    FROM marketplaces m
    WHERE ((m.id = reviews.marketplace_id) AND (m.user_id = auth.uid()))
  ))
);

-- Обновляем политику для questions: оставляем проверку через product_id
-- (у questions нет marketplace_id, поэтому просто пересоздаём существующую)
DROP POLICY IF EXISTS "Users can view questions from own products" ON public.questions;

CREATE POLICY "Users can view questions from own products" 
ON public.questions 
FOR SELECT 
USING (
  EXISTS ( 
    SELECT 1
    FROM (products p JOIN marketplaces m ON ((m.id = p.marketplace_id)))
    WHERE ((p.id = questions.product_id) AND (m.user_id = auth.uid()))
  )
);