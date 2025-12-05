-- Обновляем функцию calculate_review_segment, чтобы учитывать is_answered
CREATE OR REPLACE FUNCTION public.calculate_review_segment(review_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  
  -- Есть ли ответы в обработке (drafted / scheduled / publishing / failed / retried)
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
      AND status IN ('drafted', 'scheduled', 'publishing', 'failed', 'retried')
  ) INTO has_pending;
  
  IF has_pending THEN
    RETURN 'pending';
  END IF;
  
  -- Иначе - не отвечено
  RETURN 'unanswered';
END;
$function$;