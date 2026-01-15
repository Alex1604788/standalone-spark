-- Fix segment for reviews that were synced without proper segment value
-- Reviews with is_answered=false and no replies should be 'unanswered', not 'archived'/'pending'

UPDATE reviews r
SET
  segment = CASE
    WHEN r.is_answered = true THEN 'archived'
    WHEN EXISTS (
      SELECT 1 FROM replies rep
      WHERE rep.review_id = r.id
        AND rep.status IN ('scheduled', 'publishing', 'failed', 'retried')
    ) THEN 'pending'
    WHEN EXISTS (
      SELECT 1 FROM replies rep
      WHERE rep.review_id = r.id
        AND rep.status = 'published'
    ) THEN 'archived'
    ELSE 'unanswered'
  END,
  updated_at = NOW()
WHERE r.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND r.segment != CASE
    WHEN r.is_answered = true THEN 'archived'
    WHEN EXISTS (
      SELECT 1 FROM replies rep
      WHERE rep.review_id = r.id
        AND rep.status IN ('scheduled', 'publishing', 'failed', 'retried')
    ) THEN 'pending'
    WHEN EXISTS (
      SELECT 1 FROM replies rep
      WHERE rep.review_id = r.id
        AND rep.status = 'published'
    ) THEN 'archived'
    ELSE 'unanswered'
  END;

-- Show results
SELECT
  segment,
  is_answered,
  COUNT(*) as count
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
GROUP BY segment, is_answered
ORDER BY segment, is_answered;
