-- Исправляем search_path для функций segment

CREATE OR REPLACE FUNCTION calculate_review_segment(review_id UUID)
RETURNS TEXT 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_published BOOLEAN;
  has_pending BOOLEAN;
BEGIN
  -- Проверяем есть ли опубликованный ответ
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
    AND status = 'published'
  ) INTO has_published;
  
  IF has_published THEN
    RETURN 'archived';
  END IF;
  
  -- Проверяем есть ли ответы в обработке
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
    AND status IN ('scheduled', 'publishing', 'drafted', 'error')
  ) INTO has_pending;
  
  IF has_pending THEN
    RETURN 'pending';
  END IF;
  
  -- Иначе - не отвечено
  RETURN 'unanswered';
END;
$$;

CREATE OR REPLACE FUNCTION update_review_segment_on_review_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.segment := calculate_review_segment(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_review_segment_on_reply_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  review_id_to_update UUID;
BEGIN
  -- Определяем review_id в зависимости от операции
  IF TG_OP = 'DELETE' THEN
    review_id_to_update := OLD.review_id;
  ELSE
    review_id_to_update := NEW.review_id;
  END IF;
  
  -- Обновляем segment у отзыва
  UPDATE reviews 
  SET segment = calculate_review_segment(review_id_to_update),
      updated_at = NOW()
  WHERE id = review_id_to_update;
  
  RETURN NULL;
END;
$$;