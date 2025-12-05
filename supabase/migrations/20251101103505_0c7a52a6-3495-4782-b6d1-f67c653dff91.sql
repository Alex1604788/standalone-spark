-- Add AI logs table for tracking generation errors
CREATE TABLE IF NOT EXISTS public.logs_ai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid,
  type text NOT NULL CHECK (type IN ('review', 'question')),
  error_message text,
  model text DEFAULT 'qwen-4',
  created_at timestamptz DEFAULT now()
);

-- Add AI reply history table for tracking regenerations
CREATE TABLE IF NOT EXISTS public.ai_reply_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('review', 'question')),
  old_text text,
  new_text text NOT NULL,
  model text DEFAULT 'qwen-4',
  created_at timestamptz DEFAULT now()
);

-- Add columns to reviews table for AI workflow
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'ozon',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'new' CHECK (status IN ('new', 'ai_generated', 'approved', 'published')),
ADD COLUMN IF NOT EXISTS suggested_reply text,
ADD COLUMN IF NOT EXISTS product_image text,
ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

-- Add columns to questions table for AI workflow
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'ozon',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'new' CHECK (status IN ('new', 'ai_generated', 'approved', 'published')),
ADD COLUMN IF NOT EXISTS suggested_reply text,
ADD COLUMN IF NOT EXISTS product_image text,
ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status);
CREATE INDEX IF NOT EXISTS idx_questions_status ON public.questions(status);
CREATE INDEX IF NOT EXISTS idx_logs_ai_created ON public.logs_ai(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_history_created ON public.ai_reply_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.logs_ai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reply_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for logs_ai
CREATE POLICY "Service role can manage AI logs"
ON public.logs_ai FOR ALL
USING (true)
WITH CHECK (true);

-- RLS policies for ai_reply_history  
CREATE POLICY "Service role can manage AI history"
ON public.ai_reply_history FOR ALL
USING (true)
WITH CHECK (true);