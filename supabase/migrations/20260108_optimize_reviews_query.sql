-- Optimize reviews queries by adding composite index with review_date
-- This speeds up queries that filter by segment and order by review_date

-- Add index for common query pattern: segment filter + review_date ordering
CREATE INDEX IF NOT EXISTS idx_reviews_segment_date
  ON reviews(segment, review_date DESC);

-- Add index for marketplace + segment + date (covers most common query)
CREATE INDEX IF NOT EXISTS idx_reviews_marketplace_segment_date
  ON reviews(marketplace_id, segment, review_date DESC);

-- Add index on product_id for faster JOIN with products table
CREATE INDEX IF NOT EXISTS idx_reviews_product_id
  ON reviews(product_id) WHERE product_id IS NOT NULL;
