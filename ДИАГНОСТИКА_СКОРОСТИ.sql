-- ============================================
-- ДИАГНОСТИКА: Почему обрабатывается только 37 за 30 минут?
-- ============================================

-- 1. Проверяем, сколько отзывов должно обрабатываться
-- (для режимов "auto" или "semi")
SELECT 
  rev.rating,
  CASE rev.rating
    WHEN 1 THEN ms.reviews_mode_1
    WHEN 2 THEN ms.reviews_mode_2
    WHEN 3 THEN ms.reviews_mode_3
    WHEN 4 THEN ms.reviews_mode_4
    WHEN 5 THEN ms.reviews_mode_5
  END as mode,
  COUNT(*) as unanswered_count
FROM reviews rev
CROSS JOIN marketplace_settings ms
WHERE rev.segment = 'unanswered'
  AND rev.deleted_at IS NULL
  AND CASE rev.rating
    WHEN 1 THEN ms.reviews_mode_1
    WHEN 2 THEN ms.reviews_mode_2
    WHEN 3 THEN ms.reviews_mode_3
    WHEN 4 THEN ms.reviews_mode_4
    WHEN 5 THEN ms.reviews_mode_5
  END IN ('auto', 'semi')
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

-- 2. Проверяем настройки - какие режимы включены
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

-- 3. Проверяем, сколько отзывов обрабатывается за один запуск
-- (смотрим последние запуски cron job)
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as replies_created
FROM replies
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND deleted_at IS NULL
GROUP BY DATE_TRUNC('minute', created_at)
ORDER BY minute DESC;

-- 4. Проверяем, сколько шаблонов доступно для каждого рейтинга
SELECT 
  rating,
  COUNT(*) as template_count
FROM reply_templates
GROUP BY rating
ORDER BY rating;

-- 5. Проверяем последние созданные ответы - какой режим использовался
SELECT 
  r.status,
  r.mode,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (r.created_at - rev.created_at))) as avg_seconds_to_process
FROM replies r
JOIN reviews rev ON rev.id = r.review_id
WHERE r.created_at > NOW() - INTERVAL '1 hour'
  AND r.deleted_at IS NULL
GROUP BY r.status, r.mode
ORDER BY r.created_at DESC;

-- 6. Проверяем, сколько отзывов пропускается из-за режима "off"
SELECT 
  rev.rating,
  COUNT(*) as skipped_count
FROM reviews rev
CROSS JOIN marketplace_settings ms
WHERE rev.segment = 'unanswered'
  AND rev.deleted_at IS NULL
  AND CASE rev.rating
    WHEN 1 THEN ms.reviews_mode_1
    WHEN 2 THEN ms.reviews_mode_2
    WHEN 3 THEN ms.reviews_mode_3
    WHEN 4 THEN ms.reviews_mode_4
    WHEN 5 THEN ms.reviews_mode_5
  END = 'off'
GROUP BY rev.rating
ORDER BY rev.rating;

