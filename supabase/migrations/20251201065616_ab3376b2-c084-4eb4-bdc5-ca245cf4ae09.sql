-- Создаем триггер для обновления segment при изменении отзыва
CREATE TRIGGER trigger_update_review_segment_on_change
  BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_review_segment_on_review_change();

-- Создаем триггер для обновления segment при изменении ответов
CREATE TRIGGER trigger_update_review_segment_on_reply_change
  AFTER INSERT OR UPDATE OR DELETE ON replies
  FOR EACH ROW
  EXECUTE FUNCTION update_review_segment_on_reply_change();