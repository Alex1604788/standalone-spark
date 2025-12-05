-- First, update existing records to match new status values
-- Map old statuses to new ones
UPDATE public.reviews
SET status = CASE
  WHEN status = 'ai_generated' THEN 'new'
  WHEN status = 'approved' THEN 'moderation'
  WHEN status = 'published' THEN 'answered'
  ELSE status
END
WHERE status NOT IN ('new', 'answered', 'moderation', 'archived');

UPDATE public.questions
SET status = CASE
  WHEN status = 'ai_generated' THEN 'new'
  WHEN status = 'approved' THEN 'moderation'
  WHEN status = 'published' THEN 'answered'
  ELSE status
END
WHERE status NOT IN ('new', 'answered', 'moderation', 'archived');

-- Drop old CHECK constraints
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_status_check;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_status_check;

-- Add new CHECK constraints with correct status values
ALTER TABLE public.reviews 
  ADD CONSTRAINT reviews_status_check 
  CHECK (status IN ('new', 'answered', 'moderation', 'archived'));

ALTER TABLE public.questions 
  ADD CONSTRAINT questions_status_check 
  CHECK (status IN ('new', 'answered', 'moderation', 'archived'));