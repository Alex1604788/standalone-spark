-- ============================================================================
-- РУЧНОЕ УДАЛЕНИЕ СТАРЫХ ОТЗЫВОВ
-- ВНИМАНИЕ: Этот скрипт удалит ПОЛОВИНУ самых старых отзывов!
-- ============================================================================

-- ШАГ 1: ПРОВЕРКА - сколько отзывов будет удалено
SELECT
  'ТЕКУЩЕЕ СОСТОЯНИЕ' as status,
  COUNT(*) as total_reviews,
  COUNT(*) / 2 as reviews_to_delete,
  MIN(created_at) as oldest_review,
  MAX(created_at) as newest_review,
  pg_size_pretty(pg_total_relation_size('public.reviews')) as table_size
FROM reviews;

-- ШАГ 2: ПОСМОТРЕТЬ РАСПРЕДЕЛЕНИЕ ПО ВОЗРАСТУ
SELECT
  CASE
    WHEN created_at > NOW() - INTERVAL '30 days' THEN '0-30 дней'
    WHEN created_at > NOW() - INTERVAL '60 days' THEN '31-60 дней'
    WHEN created_at > NOW() - INTERVAL '90 days' THEN '61-90 дней'
    WHEN created_at > NOW() - INTERVAL '180 days' THEN '91-180 дней'
    WHEN created_at > NOW() - INTERVAL '365 days' THEN '181-365 дней'
    ELSE '> 365 дней'
  END as age_group,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM reviews
GROUP BY age_group
ORDER BY MIN(created_at) DESC;

-- ШАГ 3: НАЙТИ ДАТУ ОТСЕЧКИ (медиана по дате создания)
WITH median_date AS (
  SELECT created_at
  FROM reviews
  ORDER BY created_at
  LIMIT 1
  OFFSET (SELECT COUNT(*) / 2 FROM reviews)
)
SELECT
  'ДАТА ОТСЕЧКИ' as info,
  created_at as cutoff_date,
  NOW() - created_at as age
FROM median_date;

-- ============================================================================
-- ВАРИАНТЫ УДАЛЕНИЯ (ВЫБЕРИТЕ ОДИН!)
-- ============================================================================

-- ВАРИАНТ 1: Удалить отзывы старше 180 дней (рекомендуется)
-- РАСКОММЕНТИРУЙТЕ СЛЕДУЮЩИЕ СТРОКИ ДЛЯ ВЫПОЛНЕНИЯ:

/*
BEGIN;

-- Проверяем что будет удалено
SELECT
  'БУДЕТ УДАЛЕНО' as action,
  COUNT(*) as reviews_to_delete,
  COUNT(DISTINCT rating) as unique_ratings
FROM reviews
WHERE created_at < NOW() - INTERVAL '180 days';

-- Удаляем (раскомментируйте после проверки)
DELETE FROM reviews
WHERE created_at < NOW() - INTERVAL '180 days';

-- Проверяем результат
SELECT
  'РЕЗУЛЬТАТ' as status,
  COUNT(*) as remaining_reviews,
  pg_size_pretty(pg_total_relation_size('public.reviews')) as new_table_size
FROM reviews;

-- Если все ОК, раскомментируйте COMMIT:
-- COMMIT;

-- Если что-то не так, раскомментируйте ROLLBACK:
ROLLBACK;
*/

-- ============================================================================

-- ВАРИАНТ 2: Удалить ровно половину самых старых отзывов
-- РАСКОММЕНТИРУЙТЕ СЛЕДУЮЩИЕ СТРОКИ ДЛЯ ВЫПОЛНЕНИЯ:

/*
BEGIN;

-- Находим медианную дату
WITH median_date AS (
  SELECT created_at
  FROM reviews
  ORDER BY created_at
  LIMIT 1
  OFFSET (SELECT COUNT(*) / 2 FROM reviews)
)
-- Удаляем все отзывы старше медианной даты
DELETE FROM reviews
WHERE created_at < (SELECT created_at FROM median_date);

-- Проверяем результат
SELECT
  'РЕЗУЛЬТАТ' as status,
  COUNT(*) as remaining_reviews,
  MIN(created_at) as oldest_remaining,
  MAX(created_at) as newest_remaining,
  pg_size_pretty(pg_total_relation_size('public.reviews')) as new_table_size
FROM reviews;

-- Если все ОК, раскомментируйте COMMIT:
-- COMMIT;

-- Если что-то не так, раскомментируйте ROLLBACK:
ROLLBACK;
*/

-- ============================================================================

-- ВАРИАНТ 3: Удалить отзывы старше 90 дней (более агрессивная очистка)
-- РАСКОММЕНТИРУЙТЕ СЛЕДУЮЩИЕ СТРОКИ ДЛЯ ВЫПОЛНЕНИЯ:

/*
BEGIN;

DELETE FROM reviews
WHERE created_at < NOW() - INTERVAL '90 days';

SELECT
  'РЕЗУЛЬТАТ' as status,
  COUNT(*) as remaining_reviews,
  pg_size_pretty(pg_total_relation_size('public.reviews')) as new_table_size
FROM reviews;

-- COMMIT;
ROLLBACK;
*/

-- ============================================================================
-- ШАГ 4: ОСВОБОЖДЕНИЕ МЕСТА (выполните ПОСЛЕ удаления)
-- ============================================================================

-- Обычный VACUUM (не блокирует таблицу)
-- VACUUM ANALYZE reviews;

-- Полный VACUUM (блокирует таблицу, но максимально освобождает место)
-- ВНИМАНИЕ: Запускайте в нерабочее время!
-- VACUUM FULL ANALYZE reviews;

-- ============================================================================
-- ВАЖНО!
-- 1. Сначала выполните проверочные запросы (ШАГ 1-3)
-- 2. Выберите один из вариантов удаления
-- 3. Раскомментируйте выбранный блок
-- 4. Проверьте результат перед COMMIT
-- 5. После удаления выполните VACUUM для освобождения места
-- ============================================================================
