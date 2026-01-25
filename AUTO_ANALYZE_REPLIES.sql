-- =========================================================
-- 🔥 АВТОМАТИЧЕСКИЙ АНАЛИЗ ТАБЛИЦЫ REPLIES
-- Скопируй ВЕСЬ этот файл в Supabase SQL Editor и нажми RUN
-- Получишь все результаты за 1 раз!
-- =========================================================

-- 📊 1. ОБЩАЯ СТАТИСТИКА
SELECT '📊 1. ОБЩАЯ СТАТИСТИКА' as section;
SELECT
  COUNT(*) as total_records,
  MIN(created_at)::date as oldest_record,
  MAX(created_at)::date as newest_record,
  pg_size_pretty(pg_total_relation_size('public.replies')) as total_size
FROM replies;

-- 📈 2. РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ
SELECT '📈 2. РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ' as section;
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percent
FROM replies
GROUP BY status
ORDER BY count DESC;

-- 🤖 3. РАСПРЕДЕЛЕНИЕ ПО РЕЖИМАМ
SELECT '🤖 3. РАСПРЕДЕЛЕНИЕ ПО РЕЖИМАМ' as section;
SELECT
  mode,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percent
FROM replies
GROUP BY mode
ORDER BY count DESC;

-- 🗓️ 4. СТАРЫЕ ЗАПИСИ (> 90 ДНЕЙ)
SELECT '🗓️ 4. СТАРЫЕ ЗАПИСИ (> 90 ДНЕЙ)' as section;
SELECT
  status,
  COUNT(*) as old_records,
  MIN(created_at)::date as oldest,
  MAX(created_at)::date as newest
FROM replies
WHERE created_at < NOW() - INTERVAL '90 days'
GROUP BY status
ORDER BY old_records DESC;

-- 📅 5. ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)
SELECT '📅 5. ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)' as section;
SELECT
  status,
  COUNT(*) as very_old_records,
  MIN(created_at)::date as oldest
FROM replies
WHERE created_at < NOW() - INTERVAL '180 days'
GROUP BY status
ORDER BY very_old_records DESC;

-- ❌ 6. FAILED ЗАПИСИ ПО ПЕРИОДАМ
SELECT '❌ 6. FAILED ЗАПИСИ ПО ПЕРИОДАМ' as section;
SELECT
  CASE
    WHEN created_at > NOW() - INTERVAL '7 days' THEN '< 7 дней'
    WHEN created_at > NOW() - INTERVAL '30 days' THEN '7-30 дней'
    WHEN created_at > NOW() - INTERVAL '90 days' THEN '30-90 дней'
    WHEN created_at > NOW() - INTERVAL '180 days' THEN '90-180 дней'
    ELSE '> 180 дней'
  END as age_group,
  COUNT(*) as count
FROM replies
WHERE status = 'failed'
GROUP BY age_group
ORDER BY
  CASE age_group
    WHEN '< 7 дней' THEN 1
    WHEN '7-30 дней' THEN 2
    WHEN '30-90 дней' THEN 3
    WHEN '90-180 дней' THEN 4
    ELSE 5
  END;

-- 🔍 7. ПРОВЕРКА ДУБЛИКАТОВ
SELECT '🔍 7. ДУБЛИКАТЫ ПО REVIEW_ID' as section;
SELECT
  review_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(status) as statuses,
  ARRAY_AGG(id) as record_ids
FROM replies
WHERE review_id IS NOT NULL
GROUP BY review_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 📝 8. АНАЛИЗ ДЛИНЫ ТЕКСТОВ
SELECT '📝 8. АНАЛИЗ ДЛИНЫ ТЕКСТОВ' as section;
SELECT
  CASE
    WHEN LENGTH(content) < 100 THEN '< 100'
    WHEN LENGTH(content) < 500 THEN '100-500'
    WHEN LENGTH(content) < 1000 THEN '500-1000'
    WHEN LENGTH(content) < 2000 THEN '1000-2000'
    ELSE '> 2000'
  END as length_group,
  COUNT(*) as count,
  ROUND(AVG(LENGTH(content))) as avg_length
FROM replies
WHERE content IS NOT NULL
GROUP BY length_group
ORDER BY
  CASE length_group
    WHEN '< 100' THEN 1
    WHEN '100-500' THEN 2
    WHEN '500-1000' THEN 3
    WHEN '1000-2000' THEN 4
    ELSE 5
  END;

-- 📊 9. ОБЩИЙ РАЗМЕР ДАННЫХ
SELECT '📊 9. ОБЩИЙ РАЗМЕР ДАННЫХ' as section;
SELECT
  pg_size_pretty(SUM(LENGTH(content))) as total_content_size,
  ROUND(AVG(LENGTH(content))) as avg_content_length,
  MAX(LENGTH(content)) as max_content_length,
  COUNT(*) as total_records
FROM replies;

-- 🧹 10. ПОТЕНЦИАЛ ОЧИСТКИ
SELECT '🧹 10. ПОТЕНЦИАЛ ОЧИСТКИ - ПРИОРИТЕТ ВЫСОКИЙ' as section;
SELECT
  'Failed > 30 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'ВЫСОКИЙ' as priority,
  pg_size_pretty(SUM(LENGTH(content))) as space_to_free
FROM replies
WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days';

SELECT 'Failed > 60 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'ОЧЕНЬ ВЫСОКИЙ' as priority,
  pg_size_pretty(SUM(LENGTH(content))) as space_to_free
FROM replies
WHERE status = 'failed' AND created_at < NOW() - INTERVAL '60 days';

SELECT '🧹 10. ПОТЕНЦИАЛ ОЧИСТКИ - ПРИОРИТЕТ СРЕДНИЙ' as section;
SELECT
  'Drafted > 90 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'СРЕДНИЙ' as priority,
  pg_size_pretty(SUM(LENGTH(content))) as space_to_free
FROM replies
WHERE status = 'drafted' AND created_at < NOW() - INTERVAL '90 days';

SELECT '🧹 10. ПОТЕНЦИАЛ ОЧИСТКИ - ПРИОРИТЕТ НИЗКИЙ' as section;
SELECT
  'Published > 180 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'НИЗКИЙ' as priority,
  pg_size_pretty(SUM(LENGTH(content))) as space_to_free
FROM replies
WHERE status = 'published' AND published_at < NOW() - INTERVAL '180 days';

SELECT
  'Published > 365 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'ОЧЕНЬ НИЗКИЙ' as priority,
  pg_size_pretty(SUM(LENGTH(content))) as space_to_free
FROM replies
WHERE status = 'published' AND published_at < NOW() - INTERVAL '365 days';

-- 💡 11. ИТОГОВАЯ СВОДКА
SELECT '💡 11. ИТОГОВАЯ СВОДКА' as section;
SELECT
  (SELECT COUNT(*) FROM replies) as total_records,
  (SELECT COUNT(*) FROM replies WHERE created_at < NOW() - INTERVAL '90 days') as old_90_days,
  (SELECT COUNT(*) FROM replies WHERE created_at < NOW() - INTERVAL '180 days') as old_180_days,
  (SELECT COUNT(*) FROM replies WHERE status = 'failed') as total_failed,
  (SELECT COUNT(*) FROM replies WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days') as failed_cleanable,
  (SELECT COUNT(*) FROM replies WHERE status = 'drafted' AND created_at < NOW() - INTERVAL '90 days') as drafted_cleanable,
  (SELECT COUNT(*) FROM replies WHERE status = 'published' AND published_at < NOW() - INTERVAL '180 days') as published_cleanable,
  pg_size_pretty(pg_total_relation_size('public.replies')) as current_size;

-- =========================================================
-- ✅ ГОТОВО! Теперь скопируй результаты и отправь мне!
-- =========================================================
