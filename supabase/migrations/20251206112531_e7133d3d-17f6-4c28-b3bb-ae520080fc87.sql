
-- Обновляем функцию calculate_review_segment чтобы "drafted" НЕ попадал в pending
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
  
  -- Есть ли опубликованный ответ
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
      AND status = 'published'
  ) INTO has_published;
  
  -- АРХИВ: есть опубликованный ответ ИЛИ is_answered = true
  IF has_published OR v_is_answered THEN
    RETURN 'archived';
  END IF;
  
  -- Есть ли ответы в очереди (ТОЛЬКО scheduled/publishing/failed/retried)
  -- ВАЖНО: "drafted" НЕ включаем - черновики остаются в "unanswered"
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

-- Пересчитываем segment для всех отзывов с drafted статусом
UPDATE reviews r
SET segment = 'unanswered'
WHERE EXISTS (
  SELECT 1 FROM replies rep 
  WHERE rep.review_id = r.id 
    AND rep.status = 'drafted'
)
AND NOT EXISTS (
  SELECT 1 FROM replies rep 
  WHERE rep.review_id = r.id 
    AND rep.status IN ('scheduled', 'publishing', 'failed', 'retried', 'published')
)
AND r.is_answered = false;
