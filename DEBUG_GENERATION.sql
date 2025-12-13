-- ============================================
-- ДИАГНОСТИКА: Почему генерация работает медленно
-- ============================================

-- 1. Сколько неотвеченных отзывов (segment = 'unanswered')
SELECT COUNT(*) as unanswered_count
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL;

-- 2. Сколько из них уже имеют replies (но segment все еще 'unanswered')
SELECT 
  COUNT(DISTINCT r.id) as reviews_with_replies_but_unanswered
FROM reviews r
JOIN replies rep ON rep.review_id = r.id
WHERE r.segment = 'unanswered'
  AND r.deleted_at IS NULL
  AND rep.deleted_at IS NULL;

-- 3. Сколько отзывов по рейтингам в статусе 'unanswered'
SELECT 
  rating,
  COUNT(*) as count
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL
GROUP BY rating
ORDER BY rating;

-- 4. Проверяем настройки - какой режим для каждого рейтинга
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

-- 5. Сколько отзывов должно обрабатываться для каждого режима
-- (для режима "off" отзывы не обрабатываются)
SELECT 
  rev.rating,
  CASE rev.rating
    WHEN 1 THEN ms.reviews_mode_1
    WHEN 2 THEN ms.reviews_mode_2
    WHEN 3 THEN ms.reviews_mode_3
    WHEN 4 THEN ms.reviews_mode_4
    WHEN 5 THEN ms.reviews_mode_5
  END as mode,
  COUNT(*) as count
FROM reviews rev
CROSS JOIN marketplace_settings ms
WHERE rev.segment = 'unanswered'
  AND rev.deleted_at IS NULL
GROUP BY 
  rev.rating,
  CASE rev.rating
    WHEN 1 THEN ms.reviews_mode_1
    WHEN 2 THEN ms.reviews_mode_2
    WHEN 3 THEN ms.reviews_mode_3
    WHEN 4 THEN ms.reviews_mode_4
    WHEN 5 THEN ms.reviews_mode_5
  END
ORDER BY rev.rating, mode;

-- 6. Проверяем последние созданные ответы (за последний час)
SELECT 
  r.id as reply_id,
  r.review_id,
  r.status,
  r.mode,
  r.created_at,
  rev.rating,
  rev.segment as review_segment
FROM replies r
JOIN reviews rev ON rev.id = r.review_id
WHERE r.created_at > NOW() - INTERVAL '1 hour'
  AND r.deleted_at IS NULL
ORDER BY r.created_at DESC
LIMIT 50;

-- 7. Проверяем, сколько отзывов пропускается из-за существующих replies
SELECT 
  COUNT(*) as skipped_due_to_existing_replies
FROM reviews r
WHERE r.segment = 'unanswered'
  AND r.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM replies rep 
    WHERE rep.review_id = r.id 
    AND rep.deleted_at IS NULL
  );

