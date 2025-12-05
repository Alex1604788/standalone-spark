-- Add marketplace_id to questions table for better filtering and analytics
ALTER TABLE public.questions 
ADD COLUMN marketplace_id uuid REFERENCES public.marketplaces(id);

-- Create index for better query performance
CREATE INDEX idx_questions_marketplace_id ON public.questions(marketplace_id);

-- Update RLS policies to use marketplace_id directly
DROP POLICY IF EXISTS "Users can view questions from own products" ON public.questions;
DROP POLICY IF EXISTS "Service role can manage questions" ON public.questions;

CREATE POLICY "Users can view questions from own marketplaces"
ON public.questions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM marketplaces m
    WHERE m.id = questions.marketplace_id
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage questions"
ON public.questions FOR ALL
USING (true)
WITH CHECK (true);