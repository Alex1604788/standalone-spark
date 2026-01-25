-- ============================================================================
-- ДИАГНОСТИКА ПРОБЛЕМЫ С СИНХРОНИЗАЦИЕЙ
-- ============================================================================

-- 1. ПРОВЕРКА CRON JOBS
-- ============================================================================
SELECT
  jobname,
  schedule,
  active,
  jobid,
  database,
  username
FROM cron.job
WHERE jobname LIKE '%ozon%' OR jobname LIKE '%sync%' OR jobname LIKE '%generate%'
ORDER BY jobname;

-- Ожидаемый результат:
-- sync-ozon-incremental    */10 * * * *     true
-- sync-ozon-weekly          0 3 * * 0       true
-- auto-generate-drafts-cron */5 * * * *     true
-- НЕ ДОЛЖНО БЫТЬ: sync-ozon-reviews-questions


-- 2. ПРОВЕРКА ПОСЛЕДНИХ ЗАПУСКОВ CRON JOBS
-- ============================================================================
SELECT
  jobname,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobname LIKE '%ozon%' OR jobname LIKE '%sync%' OR jobname LIKE '%generate%'
ORDER BY start_time DESC
LIMIT 20;

-- Ищем ошибки в return_message


-- 3. ПРОВЕРКА ПОСЛЕДНЕЙ СИНХРОНИЗАЦИИ МАРКЕТПЛЕЙСОВ
-- ============================================================================
SELECT
  id,
  name,
  type,
  is_active,
  sync_mode,
  last_sync_at,
  NOW() - last_sync_at as "time_since_last_sync",
  service_account_email IS NOT NULL as "has_client_id",
  api_key_encrypted IS NOT NULL as "has_api_key"
FROM marketplaces
WHERE type = 'ozon'
ORDER BY last_sync_at DESC NULLS LAST;

-- last_sync_at должен обновляться каждые 10 минут


-- 4. ПРОВЕРКА НОВЫХ ОТЗЫВОВ ЗА ПОСЛЕДНИЕ 24 ЧАСА
-- ============================================================================
SELECT
  DATE_TRUNC('hour', review_date) as hour,
  COUNT(*) as reviews_count,
  COUNT(CASE WHEN is_answered THEN 1 END) as answered_count,
  COUNT(CASE WHEN segment = 'unanswered' THEN 1 END) as unanswered_count
FROM reviews
WHERE review_date > NOW() - INTERVAL '24 hours'
  AND deleted_at IS NULL
GROUP BY DATE_TRUNC('hour', review_date)
ORDER BY hour DESC;

-- Должны появляться новые отзывы если они есть в OZON


-- 5. ПРОВЕРКА СОЗДАННЫХ REPLIES ЗА ПОСЛЕДНИЙ ЧАС
-- ============================================================================
SELECT
  created_at,
  status,
  mode,
  review_id IS NOT NULL as is_review,
  question_id IS NOT NULL as is_question,
  LENGTH(content) as content_length
FROM replies
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- Должны создаваться новые replies каждые 5 минут


-- 6. ПРОВЕРКА ОТЗЫВОВ БЕЗ ОТВЕТОВ
-- ============================================================================
SELECT
  COUNT(*) as total_unanswered,
  COUNT(CASE WHEN rating = 5 THEN 1 END) as "5_stars",
  COUNT(CASE WHEN rating = 4 THEN 1 END) as "4_stars",
  COUNT(CASE WHEN rating = 3 THEN 1 END) as "3_stars",
  COUNT(CASE WHEN rating = 2 THEN 1 END) as "2_stars",
  COUNT(CASE WHEN rating = 1 THEN 1 END) as "1_star"
FROM reviews
WHERE segment = 'unanswered'
  AND deleted_at IS NULL;


-- 7. ПРОВЕРКА НАСТРОЕК АВТОГЕНЕРАЦИИ
-- ============================================================================
SELECT
  m.id as marketplace_id,
  m.name as marketplace_name,
  ms.reviews_mode_1,
  ms.reviews_mode_2,
  ms.reviews_mode_3,
  ms.reviews_mode_4,
  ms.reviews_mode_5,
  ms.questions_mode,
  ms.reply_length
FROM marketplaces m
LEFT JOIN marketplace_settings ms ON ms.marketplace_id = m.id
WHERE m.type = 'ozon' AND m.is_active = true;

-- Режимы должны быть: auto (автопубликация) или semi (черновик)
-- Если "off" - ответы не генерируются


-- 8. ПРОВЕРКА ДУБЛЕЙ (ВАЖНО!)
-- ============================================================================
SELECT
  r.id as review_id,
  r.external_id,
  r.rating,
  r.is_answered,
  r.segment,
  COUNT(rep.id) as replies_count,
  STRING_AGG(rep.status, ', ') as reply_statuses
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.deleted_at IS NULL
GROUP BY r.id, r.external_id, r.rating, r.is_answered, r.segment
HAVING COUNT(rep.id) > 1
ORDER BY replies_count DESC
LIMIT 10;

-- НЕ ДОЛЖНО быть дублей!


-- ============================================================================
-- ИНСТРУКЦИИ ПО РЕЗУЛЬТАТАМ
-- ============================================================================

/*
ЕСЛИ ПРОБЛЕМА 1: Cron jobs не созданы
- Повторно примените миграцию 20260116_setup_new_ozon_sync_logic.sql

ЕСЛИ ПРОБЛЕМА 2: last_sync_at не обновляется
- Проверьте логи в cron.job_run_details (запрос 2)
- Проверьте что маркетплейс активен и имеет API ключи (запрос 3)
- Возможно нужно задеплоить функцию sync-ozon

ЕСЛИ ПРОБЛЕМА 3: Новые отзывы не появляются
- Проверьте что отзывы есть в OZON (зайдите в кабинет)
- Проверьте API ключи
- Проверьте логи функции sync-ozon в Supabase Dashboard

ЕСЛИ ПРОБЛЕМА 4: Replies не создаются
- Проверьте настройки режимов (запрос 7)
- Если режимы = "off", измените на "auto" или "semi"
- Возможно нужно задеплоить функцию auto-generate-drafts

ЕСЛИ ПРОБЛЕМА 5: Дубли replies
- СРОЧНО задеплойте исправленные функции:
  - supabase functions deploy sync-ozon
  - supabase functions deploy auto-generate-drafts
*/
