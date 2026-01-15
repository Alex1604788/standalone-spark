-- =====================================================
-- Optimize Reviews RLS Policy Performance
-- Date: 2026-01-12
-- =====================================================
-- Problem: RLS policy does 2 EXISTS subqueries for every row
-- This causes timeout on pages with 23k+ reviews
--
-- Solution:
-- 1. Add indexes to speed up EXISTS subqueries
-- 2. Simplify policy logic to use only marketplace check
-- =====================================================

-- Step 1: Add indexes for faster EXISTS lookups
-- Index for products → marketplaces join in RLS policy
CREATE INDEX IF NOT EXISTS idx_products_id_marketplace_id
  ON products(id, marketplace_id);

-- Index for marketplaces user lookup in RLS policy
CREATE INDEX IF NOT EXISTS idx_marketplaces_id_user_id
  ON marketplaces(id, user_id);

-- Index for reviews marketplace lookup
CREATE INDEX IF NOT EXISTS idx_reviews_marketplace_id_deleted_at
  ON reviews(marketplace_id, deleted_at);

-- Step 2: Optimize RLS policy - simplify to only check marketplace
-- Since reviews.marketplace_id is always set, we don't need to check through products
DROP POLICY IF EXISTS "Users can view reviews from own products" ON public.reviews;

CREATE POLICY "Users can view reviews from own products" ON public.reviews
FOR SELECT USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM marketplaces m
    WHERE m.id = reviews.marketplace_id
      AND m.user_id = auth.uid()
  )
);

-- Service role policy stays the same
DROP POLICY IF EXISTS "Service role can manage reviews" ON public.reviews;
CREATE POLICY "Service role can manage reviews" ON public.reviews
FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- Verification queries
-- =====================================================

-- Check that indexes were created
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('reviews', 'products', 'marketplaces')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check RLS policies
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'reviews';

-- =====================================================
-- DONE!
-- This should make reviews page load instantly
-- =====================================================
