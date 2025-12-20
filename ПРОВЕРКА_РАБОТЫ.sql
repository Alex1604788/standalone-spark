-- ============================================
-- ПРОВЕРКА: Работает ли auto-generate-drafts
-- ============================================
-- Выполните эти запросы в Supabase SQL Editor

-- 1. Проверяем последние созданные ответы (за последние 30 минут)
SELECT 
  r.id as reply_id,
  r.review_id,
  r.status,
  r.mode,
  r.created_at,
  rev.rating,
  rev.segment as review_segment,
  CASE 
    WHEN r.mode = 'auto' THEN 'Автомат'
    WHEN r.mode = 'semi_auto' THEN 'Полуавтомат'
    ELSE r.mode
  END as mode_name
FROM replies r
JOIN reviews rev ON rev.id = r.review_id
WHERE r.created_at > NOW() - INTERVAL '30 minutes'
  AND r.deleted_at IS NULL
ORDER BY r.created_at DESC
LIMIT 50;

-- 2. Сколько ответов создано за последний час по статусам
SELECT 
  status,
  mode,
  COUNT(*) as count,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM replies
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND deleted_at IS NULL
GROUP BY status, mode
ORDER BY last_created DESC;

-- 3. Сколько отзывов обработано за последний час (стало scheduled/drafted)
SELECT 
  COUNT(DISTINCT review_id) as reviews_processed,
  COUNT(*) as replies_created
FROM replies
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND status IN ('scheduled', 'drafted')
  AND deleted_at IS NULL;

-- 4. Проверяем, сколько отзывов осталось в статусе 'unanswered'
SELECT 
  COUNT(*) as unanswered_count
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL;

-- 5. Проверяем, сколько отзывов в статусе 'pending' (ожидают публикации)
SELECT 
  COUNT(*) as pending_count
FROM reviews
WHERE segment = 'pending'
  AND deleted_at IS NULL;

-- 6. Проверяем настройки маркетплейса (какие режимы включены)
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

-- 7. Сколько отзывов по рейтингам в статусе 'unanswered'
SELECT 
  rating,
  COUNT(*) as count
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL
GROUP BY rating
ORDER BY rating;

-- 8. Проверяем последние логи cron job (если есть доступ к pg_cron)
-- SELECT * FROM cron.job_run_details 
-- WHERE jobname = 'auto-generate-drafts-cron'
-- ORDER BY start_time DESC
-- LIMIT 10;



