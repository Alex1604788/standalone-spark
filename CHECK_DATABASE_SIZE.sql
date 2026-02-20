-- ============================================================================
-- ПРОВЕРКА РАЗМЕРА БАЗЫ ДАННЫХ SUPABASE
-- Цель: Убедиться что укладываемся в бесплатный тариф 500 МБ
-- ============================================================================

-- 1. ОБЩИЙ РАЗМЕР БАЗЫ ДАННЫХ
SELECT
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  pg_database_size(current_database()) as database_size_bytes,
  CASE
    WHEN pg_database_size(current_database()) > 524288000 THEN '⚠️ ПРЕВЫШЕН ЛИМИТ 500MB!'
    WHEN pg_database_size(current_database()) > 419430400 THEN '⚠️ Использовано > 80% (400MB)'
    WHEN pg_database_size(current_database()) > 314572800 THEN '⚠️ Использовано > 60% (300MB)'
    ELSE '✅ В пределах нормы'
  END as status;

-- 2. РАЗМЕР КАЖДОЙ ТАБЛИЦЫ (топ-20 самых больших)
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size,
  pg_total_relation_size(schemaname||'.'||tablename) as total_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- 3. ДЕТАЛЬНАЯ СТАТИСТИКА ПО ТАБЛИЦЕ REVIEWS
SELECT
  'reviews' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as records_last_30_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '60 days') as records_last_60_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days') as records_last_90_days,
  COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '90 days') as records_older_90_days,
  COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '180 days') as records_older_180_days,
  pg_size_pretty(pg_total_relation_size('public.reviews')) as total_size,
  pg_total_relation_size('public.reviews') as total_bytes
FROM reviews;

-- 4. ДЕТАЛЬНАЯ СТАТИСТИКА ПО ТАБЛИЦЕ REPLIES
SELECT
  'replies' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as records_last_30_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '60 days') as records_last_60_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days') as records_last_90_days,
  COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '30 days') as records_older_30_days,
  COUNT(*) FILTER (WHERE reply_status = 'published') as published_count,
  COUNT(*) FILTER (WHERE reply_status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE reply_status = 'drafted') as drafted_count,
  pg_size_pretty(pg_total_relation_size('public.replies')) as total_size,
  pg_total_relation_size('public.replies') as total_bytes
FROM replies;

-- 5. АНАЛИЗ ПОТЕНЦИАЛА ЭКОНОМИИ МЕСТА
SELECT
  'Потенциал очистки REVIEWS (> 180 дней)' as operation,
  COUNT(*) as records_to_delete,
  pg_size_pretty(
    CAST(
      pg_total_relation_size('public.reviews') *
      (COUNT(*)::float / NULLIF((SELECT COUNT(*) FROM reviews), 0))
      AS bigint
    )
  ) as estimated_space_freed
FROM reviews
WHERE created_at <= NOW() - INTERVAL '180 days'

UNION ALL

SELECT
  'Потенциал очистки REPLIES (> 30 дней)' as operation,
  COUNT(*) as records_to_delete,
  pg_size_pretty(
    CAST(
      pg_total_relation_size('public.replies') *
      (COUNT(*)::float / NULLIF((SELECT COUNT(*) FROM replies), 0))
      AS bigint
    )
  ) as estimated_space_freed
FROM replies
WHERE created_at <= NOW() - INTERVAL '30 days';

-- 6. РАСПРЕДЕЛЕНИЕ ОТЗЫВОВ ПО ВОЗРАСТУ
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

-- 7. ТОП-10 САМЫХ СТАРЫХ ОТЗЫВОВ
SELECT
  id,
  review_id,
  rating,
  created_at,
  segment,
  NOW() - created_at as age
FROM reviews
ORDER BY created_at ASC
LIMIT 10;

-- 8. СТАТИСТИКА ПО ДРУГИМ БОЛЬШИМ ТАБЛИЦАМ
SELECT
  table_name,
  pg_size_pretty(total_bytes) as size,
  total_bytes
FROM (
  SELECT
    'ozon_performance_daily' as table_name,
    pg_total_relation_size('public.ozon_performance_daily') as total_bytes
  UNION ALL
  SELECT
    'products' as table_name,
    pg_total_relation_size('public.products') as total_bytes
  UNION ALL
  SELECT
    'chats' as table_name,
    pg_total_relation_size('public.chats') as total_bytes
  UNION ALL
  SELECT
    'chat_messages' as table_name,
    pg_total_relation_size('public.chat_messages') as total_bytes
  UNION ALL
  SELECT
    'import_logs' as table_name,
    pg_total_relation_size('public.import_logs') as total_bytes
) as sizes
ORDER BY total_bytes DESC;

-- ============================================================================
-- РЕКОМЕНДАЦИИ:
--
-- Если база > 400 МБ:
-- 1. Удалить отзывы старше 180 дней (см. миграцию)
-- 2. Удалить replies старше 30 дней (уже есть функция cleanup_old_replies)
-- 3. Выполнить VACUUM FULL для освобождения места
--
-- Если база > 450 МБ:
-- 1. Срочно удалить старые данные
-- 2. Рассмотреть архивацию в S3
-- 3. Проверить размер индексов
-- ============================================================================
