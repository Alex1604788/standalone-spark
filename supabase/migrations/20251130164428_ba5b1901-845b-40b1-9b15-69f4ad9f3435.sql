-- 1. Добавляем поле segment
ALTER TABLE reviews ADD COLUMN segment TEXT;

-- 2. Создаём индекс для быстрых запросов
CREATE INDEX idx_reviews_segment ON reviews(marketplace_id, segment);

-- 3. Создаём функцию для вычисления segment
CREATE OR REPLACE FUNCTION calculate_review_segment(review_id UUID)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- 4. Заполняем segment для существующих отзывов
UPDATE reviews 
SET segment = calculate_review_segment(id);

-- 5. Создаём триггер для автоматического обновления при изменении отзыва
CREATE OR REPLACE FUNCTION update_review_segment_on_review_change()
RETURNS TRIGGER AS $$
BEGIN
  NEW.segment := calculate_review_segment(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_segment_on_insert_update
BEFORE INSERT OR UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_review_segment_on_review_change();

-- 6. Создаём триггер для обновления при изменении replies
CREATE OR REPLACE FUNCTION update_review_segment_on_reply_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER reply_changes_update_review_segment
AFTER INSERT OR UPDATE OR DELETE ON replies
FOR EACH ROW
EXECUTE FUNCTION update_review_segment_on_reply_change();