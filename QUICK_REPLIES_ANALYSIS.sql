-- =====================================================
-- БЫСТРЫЙ АНАЛИЗ ТАБЛИЦЫ REPLIES (5 минут)
-- Скопируй каждый запрос в Supabase SQL Editor
-- =====================================================

-- ЗАПРОС 1: Общая статистика
-- =====================================================
SELECT
  COUNT(*) as total_records,
  MIN(created_at)::date as oldest_record,
  MAX(created_at)::date as newest_record,
  pg_size_pretty(pg_total_relation_size('public.replies')) as total_size
FROM replies;

-- ЗАПРОС 2: Распределение по статусам
-- =====================================================
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percent
FROM replies
GROUP BY status
ORDER BY count DESC;

-- ЗАПРОС 3: Старые записи (> 90 дней) по статусам
-- =====================================================
SELECT
  status,
  COUNT(*) as old_records,
  MIN(created_at)::date as oldest,
  MAX(created_at)::date as newest
FROM replies
WHERE created_at < NOW() - INTERVAL '90 days'
GROUP BY status
ORDER BY old_records DESC;

-- ЗАПРОС 4: Очень старые записи (> 180 дней)
-- =====================================================
SELECT
  status,
  COUNT(*) as very_old_records
FROM replies
WHERE created_at < NOW() - INTERVAL '180 days'
GROUP BY status
ORDER BY very_old_records DESC;

-- ЗАПРОС 5: Failed записи по периодам
-- =====================================================
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

-- ЗАПРОС 6: Дубликаты по review_id
-- =====================================================
SELECT
  review_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(status) as statuses
FROM replies
WHERE review_id IS NOT NULL
GROUP BY review_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;

-- ЗАПРОС 7: Средняя длина текстов
-- =====================================================
SELECT
  ROUND(AVG(LENGTH(content))) as avg_length,
  MAX(LENGTH(content)) as max_length,
  pg_size_pretty(SUM(LENGTH(content))) as total_text_size
FROM replies;

-- ЗАПРОС 8: ПОТЕНЦИАЛ ОЧИСТКИ
-- =====================================================
SELECT
  'Failed > 30 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'ВЫСОКИЙ' as priority
FROM replies
WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days'

UNION ALL

SELECT
  'Drafted > 90 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'СРЕДНИЙ' as priority
FROM replies
WHERE status = 'drafted' AND created_at < NOW() - INTERVAL '90 days'

UNION ALL

SELECT
  'Published > 180 дней' as cleanup_type,
  COUNT(*) as records_to_delete,
  'НИЗКИЙ' as priority
FROM replies
WHERE status = 'published' AND published_at < NOW() - INTERVAL '180 days'

ORDER BY
  CASE priority
    WHEN 'ВЫСОКИЙ' THEN 1
    WHEN 'СРЕДНИЙ' THEN 2
    ELSE 3
  END;
