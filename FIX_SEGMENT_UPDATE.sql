-- ============================================
-- ИСПРАВЛЕНИЕ: Пересчет segment для всех отзывов
-- ============================================
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Пересчитываем segment для ВСЕХ отзывов
UPDATE reviews 
SET segment = calculate_review_segment(id),
    updated_at = NOW()
WHERE segment IS DISTINCT FROM calculate_review_segment(id)
  AND deleted_at IS NULL;

-- 2. Проверяем результат - сколько отзывов в каждом сегменте
SELECT 
  segment,
  COUNT(*) as count
FROM reviews
WHERE deleted_at IS NULL
GROUP BY segment
ORDER BY segment;

-- 3. Проверяем отзывы, у которых segment не совпадает с реальным статусом
SELECT 
  r.id,
  r.segment as current_segment,
  calculate_review_segment(r.id) as correct_segment,
  r.is_answered,
  (SELECT COUNT(*) FROM replies WHERE review_id = r.id AND deleted_at IS NULL) as replies_count,
  (SELECT STRING_AGG(status::text, ', ') FROM replies WHERE review_id = r.id AND deleted_at IS NULL) as reply_statuses
FROM reviews r
WHERE r.segment != calculate_review_segment(r.id)
  AND r.deleted_at IS NULL
LIMIT 20;

-- 4. Проверяем отзывы в статусе "pending" - сколько их реально
SELECT 
  COUNT(*) as pending_count
FROM reviews
WHERE segment = 'pending'
  AND deleted_at IS NULL;

-- 5. Проверяем, есть ли отзывы с scheduled/publishing replies, но segment != 'pending'
SELECT 
  COUNT(*) as reviews_with_scheduled_but_wrong_segment
FROM reviews r
WHERE EXISTS (
  SELECT 1 FROM replies rep 
  WHERE rep.review_id = r.id 
    AND rep.status IN ('scheduled', 'publishing')
    AND rep.deleted_at IS NULL
)
  AND r.segment != 'pending'
  AND r.is_answered = false
  AND r.deleted_at IS NULL;

