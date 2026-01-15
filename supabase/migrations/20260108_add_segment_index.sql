-- Add index on segment column to speed up queries filtering by segment
-- This fixes timeout errors when loading reviews page with segment filter

CREATE INDEX IF NOT EXISTS idx_reviews_segment
  ON reviews(segment);

CREATE INDEX IF NOT EXISTS idx_reviews_marketplace_segment
  ON reviews(marketplace_id, segment);

CREATE INDEX IF NOT EXISTS idx_reviews_marketplace_segment_answered
  ON reviews(marketplace_id, segment, is_answered);

-- Show index info
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'reviews'
  AND indexname LIKE 'idx_reviews_%'
ORDER BY indexname;
