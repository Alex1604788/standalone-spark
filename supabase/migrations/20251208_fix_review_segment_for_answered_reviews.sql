-- Исправление логики calculate_review_segment:
-- Если отзыв уже отвечен в Ozon (is_answered = true), он должен попадать в Архив,
-- даже если есть failed/retried replies

CREATE OR REPLACE FUNCTION public.calculate_review_segment(review_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  has_published BOOLEAN;
  has_pending  BOOLEAN;
  v_is_answered BOOLEAN;
BEGIN
  -- Получаем is_answered для данного отзыва
  SELECT is_answered INTO v_is_answered
  FROM reviews 
  WHERE id = calculate_review_segment.review_id;
  
  -- ✅ КРИТИЧНО: Если отзыв уже отвечен в Ozon, он всегда в Архиве
  -- независимо от статуса replies (даже если есть failed/retried)
  IF v_is_answered THEN
    RETURN 'archived';
  END IF;
  
  -- Есть ли опубликованный ответ
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
      AND status = 'published'
  ) INTO has_published;
  
  -- АРХИВ: есть опубликованный ответ
  IF has_published THEN
    RETURN 'archived';
  END IF;
  
  -- Есть ли ответы в очереди (ТОЛЬКО scheduled/publishing/failed/retried)
  -- ВАЖНО: "drafted" НЕ включаем - черновики остаются в "unanswered"
  -- ВАЖНО: failed/retried попадают в pending ТОЛЬКО если is_answered = false
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
      AND status IN ('scheduled', 'publishing', 'failed', 'retried')
  ) INTO has_pending;
  
  IF has_pending THEN
    RETURN 'pending';
  END IF;
  
  -- Иначе - не отвечено (включая drafted)
  RETURN 'unanswered';
END;
$function$;

-- Пересчитываем segment для всех отзывов, которые уже отвечены в Ozon,
-- но имеют failed/retried replies (они должны быть в Архиве)
UPDATE reviews r
SET segment = 'archived',
    updated_at = NOW()
WHERE r.is_answered = true
  AND EXISTS (
    SELECT 1 FROM replies rep 
    WHERE rep.review_id = r.id 
      AND rep.status IN ('failed', 'retried')
  )
  AND r.segment != 'archived';

