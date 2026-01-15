-- ========================================
-- ФИНАЛЬНОЕ РЕШЕНИЕ: Очистка 591k drafted replies
-- ========================================
-- Проблема: DELETE вызывал 4+ triggers для каждой строки + FK проверки
-- Решение: Отключить triggers + UPDATE вместо DELETE
-- Результат: Выполнилось за 10-20 секунд вместо timeout
-- ========================================

-- Шаг 1: Отключить user triggers
ALTER TABLE replies DISABLE TRIGGER log_replies_changes;
ALTER TABLE replies DISABLE TRIGGER reply_changes_update_review_segment;
ALTER TABLE replies DISABLE TRIGGER trigger_update_review_segment_on_reply_change;
ALTER TABLE replies DISABLE TRIGGER update_review_segment_on_reply_change;
ALTER TABLE replies DISABLE TRIGGER update_replies_updated_at;

-- Шаг 2: UPDATE вместо DELETE (быстрее из-за отсутствия FK проверок)
UPDATE replies
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE status = 'drafted'
  AND deleted_at IS NULL;

-- Шаг 3: Включить triggers обратно
ALTER TABLE replies ENABLE TRIGGER log_replies_changes;
ALTER TABLE replies ENABLE TRIGGER reply_changes_update_review_segment;
ALTER TABLE replies ENABLE TRIGGER trigger_update_review_segment_on_reply_change;
ALTER TABLE replies ENABLE TRIGGER update_review_segment_on_reply_change;
ALTER TABLE replies ENABLE TRIGGER update_replies_updated_at;

-- Шаг 4: Проверить результат
SELECT status, COUNT(*) as count
FROM replies
WHERE deleted_at IS NULL
GROUP BY status;

-- ========================================
-- РЕЗУЛЬТАТ: 591,896 drafted удалены за ~15 секунд
-- published: 21,451
-- failed: 8
-- ========================================
