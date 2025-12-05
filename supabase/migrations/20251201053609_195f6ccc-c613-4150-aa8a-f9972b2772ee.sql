-- Fix calculate_review_segment to use valid reply_status enum values
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
BEGIN
  -- Есть ли опубликованный ответ
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
      AND status = 'published'
  ) INTO has_published;
  
  IF has_published THEN
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