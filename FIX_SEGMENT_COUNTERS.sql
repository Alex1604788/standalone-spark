-- ============================================
-- ИСПРАВЛЕНИЕ СЧЕТЧИКОВ: Пересчет segment для всех отзывов
-- ============================================
-- Выполните этот SQL в Supabase SQL Editor

-- 1. Пересчитываем segment для всех отзывов
UPDATE reviews 
SET segment = calculate_review_segment(id),
    updated_at = NOW()
WHERE segment IS DISTINCT FROM calculate_review_segment(id);

-- 2. Проверяем результат
SELECT 
  segment,
  COUNT(*) as count
FROM reviews
WHERE deleted_at IS NULL
GROUP BY segment
ORDER BY segment;

-- 3. Проверяем отзывы в статусе "pending" (должно быть около 20, а не 66)
SELECT 
  r.id,
  r.segment,
  r.is_answered,
  COUNT(rep.id) as replies_count,
  STRING_AGG(DISTINCT rep.status::text, ', ') as reply_statuses
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id
WHERE r.segment = 'pending'
  AND r.deleted_at IS NULL
GROUP BY r.id, r.segment, r.is_answered
ORDER BY r.updated_at DESC
LIMIT 30;

-- 4. Проверяем, есть ли отзывы с неправильным segment
SELECT 
  r.id,
  r.segment as current_segment,
  calculate_review_segment(r.id) as correct_segment,
  r.is_answered,
  (SELECT COUNT(*) FROM replies WHERE review_id = r.id) as replies_count
FROM reviews r
WHERE r.segment != calculate_review_segment(r.id)
  AND r.deleted_at IS NULL
LIMIT 20;



