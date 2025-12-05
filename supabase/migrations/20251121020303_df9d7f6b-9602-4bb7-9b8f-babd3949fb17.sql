-- Add marketplace_id column to replies table
ALTER TABLE public.replies 
ADD COLUMN marketplace_id uuid REFERENCES public.marketplaces(id);

-- Update existing replies to set marketplace_id based on review or question
UPDATE public.replies r
SET marketplace_id = COALESCE(
  (SELECT rev.marketplace_id FROM public.reviews rev WHERE rev.id = r.review_id),
  (SELECT q.marketplace_id FROM public.questions q WHERE q.id = r.question_id)
)
WHERE r.marketplace_id IS NULL;

-- Make marketplace_id NOT NULL after backfilling
ALTER TABLE public.replies 
ALTER COLUMN marketplace_id SET NOT NULL;