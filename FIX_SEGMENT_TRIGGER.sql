-- ============================================
-- ИСПРАВЛЕНИЕ: Пересчет segment и проверка триггера
-- ============================================
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Проверяем, существует ли триггер
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE '%segment%'
ORDER BY trigger_name;

-- 2. Пересчитываем segment для ВСЕХ отзывов (исправляем текущие данные)
UPDATE reviews 
SET segment = calculate_review_segment(id),
    updated_at = NOW()
WHERE segment IS DISTINCT FROM calculate_review_segment(id)
  AND deleted_at IS NULL;

-- 3. Проверяем результат - сколько отзывов в каждом сегменте
SELECT 
  segment,
  COUNT(*) as count
FROM reviews
WHERE deleted_at IS NULL
GROUP BY segment
ORDER BY segment;

-- 4. Проверяем отзывы с scheduled/publishing replies, но segment != 'pending'
SELECT 
  r.id,
  r.segment as current_segment,
  calculate_review_segment(r.id) as correct_segment,
  (SELECT STRING_AGG(status::text, ', ') FROM replies WHERE review_id = r.id AND deleted_at IS NULL) as reply_statuses
FROM reviews r
WHERE EXISTS (
  SELECT 1 FROM replies rep 
  WHERE rep.review_id = r.id 
    AND rep.status IN ('scheduled', 'publishing')
    AND rep.deleted_at IS NULL
)
  AND r.segment != 'pending'
  AND r.is_answered = false
  AND r.deleted_at IS NULL
LIMIT 20;

-- 5. Исправляем отзывы с неправильным segment
UPDATE reviews r
SET segment = 'pending',
    updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM replies rep 
  WHERE rep.review_id = r.id 
    AND rep.status IN ('scheduled', 'publishing')
    AND rep.deleted_at IS NULL
)
  AND r.segment != 'pending'
  AND r.is_answered = false
  AND r.deleted_at IS NULL;

-- 6. Финальная проверка
SELECT 
  segment,
  COUNT(*) as count
FROM reviews
WHERE deleted_at IS NULL
GROUP BY segment
ORDER BY segment;

