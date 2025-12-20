-- ============================================
-- ПРОВЕРКА СТАТУСА ГЕНЕРАЦИИ
-- ============================================
-- Выполните этот SQL для проверки, работает ли генерация

-- 1. Проверяем, сколько неотвеченных отзывов (segment = 'unanswered')
SELECT COUNT(*) as unanswered_count
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL;

-- 2. Проверяем последние созданные ответы (за последний час)
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

-- 3. Проверяем ответы со статусом scheduled (должны отправляться)
SELECT 
  COUNT(*) as scheduled_count,
  MIN(created_at) as oldest_scheduled,
  MAX(created_at) as newest_scheduled
FROM replies
WHERE status = 'scheduled'
  AND deleted_at IS NULL;

-- 4. Проверяем, используются ли шаблоны
SELECT 
  rt.rating,
  COUNT(*) as template_count,
  SUM(rt.use_count) as total_uses
FROM reply_templates rt
GROUP BY rt.rating
ORDER BY rt.rating;

-- 5. Проверяем настройки маркетплейса (используются ли шаблоны)
SELECT 
  ms.marketplace_id,
  ms.reviews_mode_1,
  ms.reviews_mode_2,
  ms.reviews_mode_3,
  ms.reviews_mode_4,
  ms.reviews_mode_5,
  ms.use_templates_1,
  ms.use_templates_2,
  ms.use_templates_3,
  ms.use_templates_4,
  ms.use_templates_5
FROM marketplace_settings ms;



