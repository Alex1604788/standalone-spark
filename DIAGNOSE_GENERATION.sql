-- ============================================
-- ДИАГНОСТИКА: Почему так мало отзывов обрабатывается
-- ============================================

-- 1. Сколько неотвеченных отзывов (segment = 'unanswered')
SELECT COUNT(*) as unanswered_count
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL;

-- 2. Сколько отзывов по рейтингам в статусе 'unanswered'
SELECT 
  rating,
  COUNT(*) as count
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL
GROUP BY rating
ORDER BY rating;

-- 3. Проверяем, у скольких отзывов уже есть ответы (но segment все еще 'unanswered')
SELECT 
  COUNT(DISTINCT r.id) as reviews_with_replies_but_unanswered_segment
FROM reviews r
JOIN replies rep ON rep.review_id = r.id
WHERE r.segment = 'unanswered'
  AND r.deleted_at IS NULL
  AND rep.deleted_at IS NULL;

-- 4. Проверяем последние созданные ответы (за последний час)
SELECT 
  r.id as reply_id,
  r.review_id,
  r.status,
  r.mode,
  r.created_at,
  rev.rating,
  rev.segment as review_segment,
  rev.is_answered
FROM replies r
JOIN reviews rev ON rev.id = r.review_id
WHERE r.created_at > NOW() - INTERVAL '1 hour'
  AND r.deleted_at IS NULL
ORDER BY r.created_at DESC
LIMIT 50;

-- 5. Проверяем настройки режимов для каждого рейтинга
SELECT 
  reviews_mode_1,
  reviews_mode_2,
  reviews_mode_3,
  reviews_mode_4,
  reviews_mode_5,
  use_templates_1,
  use_templates_2,
  use_templates_3,
  use_templates_4,
  use_templates_5
FROM marketplace_settings
LIMIT 1;

-- 6. Сколько отзывов должно обрабатываться для каждого режима
SELECT 
  rev.rating,
  ms.reviews_mode_1,
  ms.reviews_mode_2,
  ms.reviews_mode_3,
  ms.reviews_mode_4,
  ms.reviews_mode_5,
  COUNT(*) as count
FROM reviews rev
CROSS JOIN marketplace_settings ms
WHERE rev.segment = 'unanswered'
  AND rev.deleted_at IS NULL
GROUP BY 
  rev.rating,
  ms.reviews_mode_1,
  ms.reviews_mode_2,
  ms.reviews_mode_3,
  ms.reviews_mode_4,
  ms.reviews_mode_5
ORDER BY rev.rating;



