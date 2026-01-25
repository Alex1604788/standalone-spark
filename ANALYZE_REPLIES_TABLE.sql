-- =====================================================
-- ГЛУБОКИЙ АНАЛИЗ ТАБЛИЦЫ REPLIES
-- Цель: Понять период данных и возможности оптимизации
-- =====================================================

-- 1. ОБЩАЯ СТАТИСТИКА
SELECT
  'ОБЩАЯ СТАТИСТИКА' as section,
  COUNT(*) as total_records,
  COUNT(DISTINCT marketplace_id) as unique_marketplaces,
  COUNT(DISTINCT review_id) as unique_reviews,
  COUNT(DISTINCT question_id) as unique_questions,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  AGE(MAX(created_at), MIN(created_at)) as data_period,
  pg_size_pretty(pg_total_relation_size('public.replies')) as total_size,
  pg_size_pretty(pg_relation_size('public.replies')) as data_size,
  pg_size_pretty(pg_indexes_size('public.replies')) as indexes_size
FROM replies;

-- 2. РАЗМЕР ПО КОМПОНЕНТАМ
SELECT
  'РАЗМЕР ПО КОМПОНЕНТАМ' as section,
  pg_size_pretty(pg_relation_size('public.replies')) as table_data,
  pg_size_pretty(pg_indexes_size('public.replies')) as indexes,
  pg_size_pretty(pg_total_relation_size('public.replies') - pg_relation_size('public.replies') - pg_indexes_size('public.replies')) as toast_and_other,
  pg_size_pretty(pg_total_relation_size('public.replies')) as total,
  ROUND(pg_indexes_size('public.replies') * 100.0 / NULLIF(pg_total_relation_size('public.replies'), 0), 2) as index_percent
FROM pg_class
WHERE relname = 'replies'
LIMIT 1;

-- 3. РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ
SELECT
  'РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ' as section,
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percent,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
  ) as estimated_size,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM replies
GROUP BY status
ORDER BY count DESC;

-- 4. РАСПРЕДЕЛЕНИЕ ПО РЕЖИМАМ (manual/semi_auto/auto)
SELECT
  'РАСПРЕДЕЛЕНИЕ ПО РЕЖИМАМ' as section,
  mode,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percent
FROM replies
GROUP BY mode
ORDER BY count DESC;

-- 5. ВРЕМЕННОЕ РАСПРЕДЕЛЕНИЕ (по месяцам)
SELECT
  'РАСПРЕДЕЛЕНИЕ ПО МЕСЯЦАМ' as section,
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as records,
  COUNT(*) FILTER (WHERE status = 'published') as published,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'drafted') as drafted,
  COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
  ) as estimated_size
FROM replies
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC
LIMIT 24;

-- 6. СТАРЫЕ ЗАПИСИ ПО СТАТУСАМ (потенциал для удаления)
SELECT
  'СТАРЫЕ ЗАПИСИ (> 90 ДНЕЙ)' as section,
  status,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
  ) as estimated_size_savings,
  MIN(created_at) as oldest_date,
  MAX(created_at) as newest_date
FROM replies
WHERE created_at < NOW() - INTERVAL '90 days'
GROUP BY status
ORDER BY old_records DESC;

-- 7. ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)
SELECT
  'ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)' as section,
  status,
  COUNT(*) as very_old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
  ) as estimated_size_savings
FROM replies
WHERE created_at < NOW() - INTERVAL '180 days'
GROUP BY status
ORDER BY very_old_records DESC;

-- 8. ЗАПИСИ С ОШИБКАМИ (failed, можно удалять старые)
SELECT
  'FAILED ЗАПИСИ ПО ПЕРИОДАМ' as section,
  CASE
    WHEN created_at > NOW() - INTERVAL '7 days' THEN '< 7 дней'
    WHEN created_at > NOW() - INTERVAL '30 days' THEN '7-30 дней'
    WHEN created_at > NOW() - INTERVAL '90 days' THEN '30-90 дней'
    WHEN created_at > NOW() - INTERVAL '180 days' THEN '90-180 дней'
    ELSE '> 180 дней'
  END as age_group,
  COUNT(*) as count,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
  ) as estimated_size
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

-- 9. PUBLISHED ЗАПИСИ ПО ПЕРИОДАМ
SELECT
  'PUBLISHED ЗАПИСИ ПО ПЕРИОДАМ' as section,
  CASE
    WHEN published_at > NOW() - INTERVAL '30 days' THEN '< 30 дней'
    WHEN published_at > NOW() - INTERVAL '90 days' THEN '30-90 дней'
    WHEN published_at > NOW() - INTERVAL '180 days' THEN '90-180 дней'
    WHEN published_at > NOW() - INTERVAL '365 days' THEN '180-365 дней'
    ELSE '> 365 дней'
  END as age_group,
  COUNT(*) as count,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
  ) as estimated_size
FROM replies
WHERE status = 'published' AND published_at IS NOT NULL
GROUP BY age_group
ORDER BY
  CASE age_group
    WHEN '< 30 дней' THEN 1
    WHEN '30-90 дней' THEN 2
    WHEN '90-180 дней' THEN 3
    WHEN '180-365 дней' THEN 4
    ELSE 5
  END;

-- 10. АНАЛИЗ ДЛИНЫ ТЕКСТОВ (TOAST данные)
SELECT
  'АНАЛИЗ ДЛИНЫ ТЕКСТОВ' as section,
  CASE
    WHEN LENGTH(content) < 100 THEN '< 100 символов'
    WHEN LENGTH(content) < 500 THEN '100-500 символов'
    WHEN LENGTH(content) < 1000 THEN '500-1000 символов'
    WHEN LENGTH(content) < 2000 THEN '1000-2000 символов'
    ELSE '> 2000 символов'
  END as content_length_group,
  COUNT(*) as count,
  AVG(LENGTH(content))::int as avg_length,
  MAX(LENGTH(content)) as max_length,
  pg_size_pretty(SUM(LENGTH(content))) as total_text_size
FROM replies
GROUP BY content_length_group
ORDER BY avg_length;

-- 11. ТОП 10 САМЫХ ДЛИННЫХ ОТВЕТОВ (потенциально проблемные)
SELECT
  'ТОП 10 САМЫХ ДЛИННЫХ ОТВЕТОВ' as section,
  id,
  status,
  LENGTH(content) as text_length,
  pg_size_pretty(LENGTH(content)) as text_size,
  created_at,
  LEFT(content, 100) as preview
FROM replies
ORDER BY LENGTH(content) DESC
LIMIT 10;

-- 12. РАСПРЕДЕЛЕНИЕ ПО MARKETPLACE
SELECT
  'РАСПРЕДЕЛЕНИЕ ПО MARKETPLACE' as section,
  marketplace_id,
  COUNT(*) as total_replies,
  COUNT(*) FILTER (WHERE status = 'published') as published,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'drafted') as drafted,
  MIN(created_at) as oldest,
  MAX(created_at) as newest,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
  ) as estimated_size
FROM replies
GROUP BY marketplace_id
ORDER BY total_replies DESC;

-- 13. ПРОВЕРКА ДУБЛИКАТОВ (несмотря на уникальный индекс)
SELECT
  'ПРОВЕРКА ДУБЛИКАТОВ REVIEW_ID' as section,
  review_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(status) as statuses,
  ARRAY_AGG(created_at ORDER BY created_at) as created_dates
FROM replies
WHERE review_id IS NOT NULL
GROUP BY review_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;

-- 14. ПРОВЕРКА ДУБЛИКАТОВ QUESTION_ID
SELECT
  'ПРОВЕРКА ДУБЛИКАТОВ QUESTION_ID' as section,
  question_id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(status) as statuses,
  ARRAY_AGG(created_at ORDER BY created_at) as created_dates
FROM replies
WHERE question_id IS NOT NULL
GROUP BY question_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;

-- 15. ОТВЕТЫ БЕЗ СВЯЗАННОГО ОТЗЫВА/ВОПРОСА (orphaned records)
SELECT
  'ORPHANED REPLIES (без review/question)' as section,
  status,
  COUNT(*) as orphaned_count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM replies r
WHERE (r.review_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reviews rev WHERE rev.id = r.review_id))
   OR (r.question_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = r.question_id))
GROUP BY status
ORDER BY orphaned_count DESC;

-- 16. ИНДЕКСЫ НА ТАБЛИЦЕ REPLIES
SELECT
  'ИНДЕКСЫ НА ТАБЛИЦЕ REPLIES' as section,
  indexname as index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  pg_relation_size(indexrelid) as index_bytes,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND tablename = 'replies'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 17. DEAD TUPLES (мёртвые записи после UPDATE/DELETE)
SELECT
  'DEAD TUPLES В ТАБЛИЦЕ REPLIES' as section,
  n_live_tup as live_tuples,
  n_dead_tup as dead_tuples,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_percent,
  pg_size_pretty(pg_total_relation_size('public.replies')) as current_size,
  pg_size_pretty(
    CAST(pg_total_relation_size('public.replies') * (1 - n_dead_tup * 1.0 / NULLIF(n_live_tup + n_dead_tup, 0)) AS bigint)
  ) as size_after_vacuum,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND relname = 'replies';

-- 18. RETRY COUNT АНАЛИЗ (записи с большим количеством retry)
SELECT
  'RETRY COUNT АНАЛИЗ' as section,
  CASE
    WHEN retry_count = 0 THEN '0 попыток'
    WHEN retry_count = 1 THEN '1 попытка'
    WHEN retry_count BETWEEN 2 AND 5 THEN '2-5 попыток'
    ELSE '> 5 попыток'
  END as retry_group,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percent
FROM replies
GROUP BY retry_group
ORDER BY
  CASE retry_group
    WHEN '0 попыток' THEN 1
    WHEN '1 попытка' THEN 2
    WHEN '2-5 попыток' THEN 3
    ELSE 4
  END;

-- 19. ИТОГОВЫЕ РЕКОМЕНДАЦИИ ПО ОЧИСТКЕ
WITH cleanup_potential AS (
  SELECT
    'Failed старше 30 дней' as cleanup_type,
    COUNT(*) as records,
    pg_size_pretty(
      COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
    ) as size_savings,
    1 as priority
  FROM replies
  WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days'

  UNION ALL

  SELECT
    'Published старше 180 дней' as cleanup_type,
    COUNT(*) as records,
    pg_size_pretty(
      COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
    ) as size_savings,
    2 as priority
  FROM replies
  WHERE status = 'published' AND published_at < NOW() - INTERVAL '180 days'

  UNION ALL

  SELECT
    'Drafted старше 90 дней' as cleanup_type,
    COUNT(*) as records,
    pg_size_pretty(
      COUNT(*) * (SELECT pg_total_relation_size('public.replies') / NULLIF(COUNT(*), 0) FROM replies)
    ) as size_savings,
    3 as priority
  FROM replies
  WHERE status = 'drafted' AND created_at < NOW() - INTERVAL '90 days'
)
SELECT
  'ПОТЕНЦИАЛ ОЧИСТКИ' as section,
  cleanup_type,
  records,
  size_savings,
  CASE priority
    WHEN 1 THEN 'ВЫСОКИЙ'
    WHEN 2 THEN 'СРЕДНИЙ'
    ELSE 'НИЗКИЙ'
  END as priority_level
FROM cleanup_potential
WHERE records > 0
ORDER BY priority;
