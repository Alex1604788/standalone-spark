-- PostgreSQL function to properly archive old 2025 reviews
-- Uses two sequential UPDATEs so the BEFORE trigger reads updated is_answered=true on second pass
CREATE OR REPLACE FUNCTION archive_old_reviews_batch(p_batch_size INT DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ids UUID[];
  v_archived INT := 0;
  v_replies_deleted INT := 0;
  v_remaining INT;
BEGIN
  -- Get a batch of old review IDs still in unanswered/pending
  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id FROM reviews
    WHERE review_date < '2026-01-01T00:00:00Z'
      AND segment IN ('unanswered', 'pending')
      AND deleted_at IS NULL
    ORDER BY review_date ASC
    LIMIT p_batch_size
  ) t;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    SELECT COUNT(*)::INT INTO v_remaining
    FROM reviews
    WHERE review_date < '2026-01-01T00:00:00Z'
      AND segment IN ('unanswered', 'pending')
      AND deleted_at IS NULL;
    RETURN jsonb_build_object(
      'archived', 0,
      'replies_deleted', 0,
      'remaining', v_remaining,
      'done', true
    );
  END IF;

  -- Step 1: Cancel scheduled/drafted replies for these reviews
  UPDATE replies
  SET deleted_at = NOW()
  WHERE review_id = ANY(v_ids)
    AND status IN ('scheduled', 'drafted')
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_replies_deleted = ROW_COUNT;

  -- Step 2: Set is_answered=true
  -- BEFORE trigger fires but reads OLD is_answered=false, sets segment='unanswered'
  -- That's OK - is_answered=true IS saved to DB
  UPDATE reviews
  SET is_answered = true
  WHERE id = ANY(v_ids)
    AND deleted_at IS NULL;

  -- Step 3: Second UPDATE - trigger NOW reads is_answered=true from DB → sets segment='archived'
  UPDATE reviews
  SET segment = 'archived'
  WHERE id = ANY(v_ids)
    AND is_answered = true
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  -- Count remaining
  SELECT COUNT(*)::INT INTO v_remaining
  FROM reviews
  WHERE review_date < '2026-01-01T00:00:00Z'
    AND segment IN ('unanswered', 'pending')
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'archived', v_archived,
    'replies_deleted', v_replies_deleted,
    'remaining', v_remaining,
    'done', v_remaining = 0
  );
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION archive_old_reviews_batch(INT) TO service_role;
