-- Add sku column to questions table to enable product matching via SQL
-- Previously sync only used sku for lookup but didn't store it
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS sku TEXT;

-- Index for fast SQL-based product matching
CREATE INDEX IF NOT EXISTS idx_questions_sku ON public.questions(sku) WHERE sku IS NOT NULL;

-- After sync populates sku, this will fix unmatched questions:
-- UPDATE questions q SET product_id = p.id, updated_at = NOW()
-- FROM products p
-- WHERE q.sku = p.sku AND q.marketplace_id = p.marketplace_id
-- AND q.product_id IS NULL AND q.deleted_at IS NULL;
