-- Исправление предупреждений безопасности

-- 1. Удаляем Security Definer Views
DROP VIEW IF EXISTS public.active_reviews;
DROP VIEW IF EXISTS public.active_questions;
DROP VIEW IF EXISTS public.active_replies;

-- 2. Обновляем RLS политики для автоматической фильтрации неудаленных записей

-- Reviews policies
DROP POLICY IF EXISTS "Users can view reviews from own products" ON public.reviews;
CREATE POLICY "Users can view reviews from own products" ON public.reviews
FOR SELECT USING (
  deleted_at IS NULL AND (
    (EXISTS (
      SELECT 1 FROM products p
      JOIN marketplaces m ON m.id = p.marketplace_id
      WHERE p.id = reviews.product_id AND m.user_id = auth.uid()
    )) OR (EXISTS (
      SELECT 1 FROM marketplaces m
      WHERE m.id = reviews.marketplace_id AND m.user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "Service role can manage reviews" ON public.reviews;
CREATE POLICY "Service role can manage reviews" ON public.reviews
FOR ALL USING (true) WITH CHECK (true);

-- Questions policies
DROP POLICY IF EXISTS "Users can view questions from own marketplaces" ON public.questions;
CREATE POLICY "Users can view questions from own marketplaces" ON public.questions
FOR SELECT USING (
  deleted_at IS NULL AND (
    EXISTS (
      SELECT 1 FROM marketplaces m
      WHERE m.id = questions.marketplace_id AND m.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Service role can manage questions" ON public.questions;
CREATE POLICY "Service role can manage questions" ON public.questions
FOR ALL USING (true) WITH CHECK (true);

-- Replies policies
DROP POLICY IF EXISTS "Users can view replies from own reviews/questions" ON public.replies;
CREATE POLICY "Users can view replies from own reviews/questions" ON public.replies
FOR SELECT USING (
  deleted_at IS NULL AND (
    (EXISTS (
      SELECT 1 FROM reviews r
      JOIN products p ON p.id = r.product_id
      JOIN marketplaces m ON m.id = p.marketplace_id
      WHERE r.id = replies.review_id AND m.user_id = auth.uid()
    )) OR (EXISTS (
      SELECT 1 FROM questions q
      JOIN products p ON p.id = q.product_id
      JOIN marketplaces m ON m.id = p.marketplace_id
      WHERE q.id = replies.question_id AND m.user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "Users can manage replies from own reviews/questions" ON public.replies;
CREATE POLICY "Users can manage replies from own reviews/questions" ON public.replies
FOR ALL USING (
  (EXISTS (
    SELECT 1 FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE r.id = replies.review_id AND m.user_id = auth.uid()
  )) OR (EXISTS (
    SELECT 1 FROM questions q
    JOIN products p ON p.id = q.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE q.id = replies.question_id AND m.user_id = auth.uid()
  ))
) WITH CHECK (
  (EXISTS (
    SELECT 1 FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE r.id = replies.review_id AND m.user_id = auth.uid()
  )) OR (EXISTS (
    SELECT 1 FROM questions q
    JOIN products p ON p.id = q.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE q.id = replies.question_id AND m.user_id = auth.uid()
  ))
);