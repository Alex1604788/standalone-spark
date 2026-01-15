-- Optimized batch deletion of duplicate replies
-- Problem: Too many duplicates (900+ per review) cause timeout
-- Solution: Delete in small batches using LIMIT

-- Step 1: Create temporary function to delete duplicates in batches
CREATE OR REPLACE FUNCTION delete_duplicate_replies_batch(batch_size INT DEFAULT 1000)
RETURNS TABLE(deleted_count INT) AS $$
DECLARE
  total_deleted INT := 0;
  batch_deleted INT;
BEGIN
  LOOP
    -- Delete one batch of duplicates
    DELETE FROM replies
    WHERE id IN (
      SELECT r1.id
      FROM replies r1
      WHERE r1.review_id IS NOT NULL
        AND r1.deleted_at IS NULL
        AND r1.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
        AND EXISTS (
          SELECT 1
          FROM replies r2
          WHERE r2.review_id = r1.review_id
            AND r2.deleted_at IS NULL
            AND r2.marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
            AND r2.created_at > r1.created_at
          LIMIT 1
        )
      LIMIT batch_size
    );

    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    total_deleted := total_deleted + batch_deleted;

    -- Exit if no more rows deleted
    EXIT WHEN batch_deleted = 0;

    -- Small delay to avoid overloading
    PERFORM pg_sleep(0.1);
  END LOOP;

  RETURN QUERY SELECT total_deleted;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Execute the batch deletion
SELECT delete_duplicate_replies_batch(1000);

-- Step 3: Verify results
SELECT
  'Total reviews with duplicates: ' || COUNT(DISTINCT review_id) as result
FROM (
  SELECT review_id
  FROM replies
  WHERE review_id IS NOT NULL
    AND deleted_at IS NULL
    AND marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  GROUP BY review_id
  HAVING COUNT(*) > 1
) duplicates;

-- Step 4: Check final status counts
SELECT status, COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;
