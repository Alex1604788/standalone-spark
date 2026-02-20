-- ========================================
-- 🔍 ПОЛНАЯ ДИАГНОСТИКА ПРОБЛЕМЫ
-- ========================================
-- Дата: 2026-01-25
-- Используйте в Supabase SQL Editor

-- ========================================
-- 1. ПРОВЕРКА CRON JOBS
-- ========================================
-- Должно быть 2 задачи: sync-ozon-incremental и sync-ozon-weekly

SELECT
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname LIKE '%ozon%'
ORDER BY jobname;

-- ✅ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:
-- sync-ozon-incremental | */10 * * * * | true
-- sync-ozon-weekly      | 0 3 * * 0    | true
--
-- ❌ НЕ ДОЛЖНО БЫТЬ: sync-ozon-reviews-questions

-- ========================================
-- 2. ПРОВЕРКА ПОСЛЕДНЕЙ СИНХРОНИЗАЦИИ
-- ========================================
-- Если миграция применена, last_sync_at должен обновляться каждые 10 минут

SELECT
  id,
  name,
  type,
  last_sync_at,
  NOW() - last_sync_at as "время_назад",
  CASE
    WHEN (NOW() - last_sync_at) < interval '15 minutes' THEN '✅ Работает'
    WHEN (NOW() - last_sync_at) < interval '1 hour' THEN '⚠️  Задержка'
    ELSE '❌ Не работает'
  END as "статус"
FROM marketplaces
WHERE type = 'ozon';

-- ✅ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:
-- время_назад < 15 минут
-- статус = "✅ Работает"

-- ========================================
-- 3. ПРОВЕРКА НА ДУБЛИ
-- ========================================
-- НЕ ДОЛЖНО быть отзывов с несколькими ответами

SELECT
  r.id as review_id,
  r.external_id,
  r.text as review_text,
  COUNT(rep.id) as replies_count,
  STRING_AGG(rep.status::text, ', ') as statuses,
  STRING_AGG(rep.id::text, ', ') as reply_ids
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.deleted_at IS NULL
GROUP BY r.id, r.external_id, r.text
HAVING COUNT(rep.id) > 1
ORDER BY replies_count DESC;

-- ✅ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПУСТО (нет строк)
-- ❌ ЕСЛИ ЕСТЬ СТРОКИ: дубли всё ещё создаются!

-- ========================================
-- 4. ПРОВЕРКА is_answered FLAG
-- ========================================
-- Проверяем что is_answered корректно установлен

SELECT
  r.id,
  r.external_id,
  r.is_answered,
  r.segment,
  COUNT(rep.id) as replies_count,
  STRING_AGG(rep.status::text, ', ') as reply_statuses
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.deleted_at IS NULL
GROUP BY r.id, r.external_id, r.is_answered, r.segment
HAVING
  -- Случай 1: есть published reply но is_answered = false (ОШИБКА!)
  (COUNT(rep.id) > 0 AND 'published' = ANY(ARRAY_AGG(rep.status)) AND r.is_answered = false)
  OR
  -- Случай 2: нет replies но is_answered = true (возможно OK если comments_amount > 0)
  (COUNT(rep.id) = 0 AND r.is_answered = true)
ORDER BY r.id DESC
LIMIT 20;

-- ✅ ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: ПУСТО или только Случай 2
-- ❌ ЕСЛИ Случай 1: sync-ozon НЕ задеплоен или работает старая версия!

-- ========================================
-- 5. ПРОВЕРКА АКТИВНЫХ CRON JOBS (ПОДРОБНО)
-- ========================================
-- Детальная информация о cron jobs

SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  j.nodename,
  js.last_run_started_at,
  js.last_run_finished_at,
  js.last_run_status,
  js.last_run_error
FROM cron.job j
LEFT JOIN cron.job_run_details js ON js.jobid = j.jobid
WHERE j.jobname LIKE '%ozon%'
ORDER BY js.last_run_started_at DESC NULLS LAST
LIMIT 10;

-- Проверьте:
-- ✅ last_run_started_at - недавно (< 15 минут для incremental)
-- ✅ last_run_status = 'succeeded'
-- ❌ last_run_error - должно быть NULL

-- ========================================
-- 6. СТАТИСТИКА ПО ОТЗЫВАМ
-- ========================================
-- Общая картина по отзывам и ответам

SELECT
  COUNT(*) as total_reviews,
  COUNT(CASE WHEN r.is_answered THEN 1 END) as answered_reviews,
  COUNT(CASE WHEN r.segment = 'unanswered' THEN 1 END) as unanswered_segment,
  COUNT(CASE WHEN r.segment = 'pending' THEN 1 END) as pending_segment,
  COUNT(CASE WHEN rep.status = 'published' THEN 1 END) as published_replies,
  COUNT(CASE WHEN rep.status = 'scheduled' THEN 1 END) as scheduled_replies,
  COUNT(CASE WHEN rep.status = 'draft' THEN 1 END) as draft_replies
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.deleted_at IS NULL;

-- ========================================
-- 7. ПОСЛЕДНИЕ 10 ОТЗЫВОВ
-- ========================================
-- Проверяем свежие отзывы

SELECT
  r.id,
  r.external_id,
  r.created_at as review_created,
  r.is_answered,
  r.segment,
  COUNT(rep.id) as replies_count,
  STRING_AGG(rep.status::text, ', ') as reply_statuses
FROM reviews r
LEFT JOIN replies rep ON rep.review_id = r.id AND rep.deleted_at IS NULL
WHERE r.deleted_at IS NULL
GROUP BY r.id, r.external_id, r.created_at, r.is_answered, r.segment
ORDER BY r.created_at DESC
LIMIT 10;

-- ========================================
-- 8. ПРОВЕРКА ВЕРСИЙ EDGE FUNCTIONS (через логи)
-- ========================================
-- Эту часть нужно проверять в Supabase Dashboard → Edge Functions → Logs

/*
Откройте:
https://supabase.com/dashboard/project/bkmicyguzlwampuindff/logs/edge-functions

Найдите в логах sync-ozon:
✅ "[sync-ozon] Found N reviews with published replies" - значит версия 2026-01-16-v2

Найдите в логах auto-generate-drafts:
✅ "[auto-generate-drafts] Skip review XXX: reply exists (status: published)" - значит версия 2026-01-16-v1

❌ Если этих сообщений НЕТ: функции НЕ задеплоены или работают старые версии!
*/

-- ========================================
-- 🎯 ИНТЕРПРЕТАЦИЯ РЕЗУЛЬТАТОВ
-- ========================================

/*
СЦЕНАРИЙ 1: Cron jobs НЕ СОЗДАНЫ
- Запрос 1 пустой или показывает старый sync-ozon-reviews-questions
- РЕШЕНИЕ: Применить SQL миграцию 20260116_setup_new_ozon_sync_logic.sql

СЦЕНАРИЙ 2: Cron jobs созданы, но last_sync_at не обновляется
- Запрос 1 показывает jobs ✅
- Запрос 2 показывает время_назад > 1 час ❌
- РЕШЕНИЕ: Проверить логи Edge Functions, возможно ошибка в функции

СЦЕНАРИЙ 3: Дубли всё равно появляются
- Запрос 3 показывает строки ❌
- РЕШЕНИЕ: Edge Functions НЕ задеплоены или старые версии
  → supabase functions deploy sync-ozon --no-verify-jwt
  → supabase functions deploy auto-generate-drafts --no-verify-jwt

СЦЕНАРИЙ 4: is_answered сбрасывается для published
- Запрос 4 показывает Случай 1 ❌
- РЕШЕНИЕ: sync-ozon версия НЕ 2026-01-16-v2
  → supabase functions deploy sync-ozon --no-verify-jwt

СЦЕНАРИЙ 5: Всё работает ✅
- Запрос 1: 2 cron jobs active
- Запрос 2: время_назад < 15 минут
- Запрос 3: ПУСТО (нет дублей)
- Запрос 4: ПУСТО или только Случай 2
- Запрос 5: last_run_status = 'succeeded'
*/

-- ========================================
-- 📊 СВОДКА ДЛЯ ОТПРАВКИ МНЕ
-- ========================================

/*
Пожалуйста, скопируйте результаты следующих запросов:

1. Запрос 1 (Cron jobs) - полностью
2. Запрос 2 (Последняя синхронизация) - только столбцы "время_назад" и "статус"
3. Запрос 3 (Дубли) - сколько строк? (или "ПУСТО")
4. Запрос 4 (is_answered) - сколько строк? (или "ПУСТО")
5. Запрос 5 (Активные jobs) - только last_run_status и last_run_error

Это поможет быстро определить проблему!
*/
