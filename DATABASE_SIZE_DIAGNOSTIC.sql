-- =====================================================
-- ДИАГНОСТИКА РАЗМЕРА БАЗЫ ДАННЫХ SUPABASE
-- Цель: Выявить что занимает 6GB и где можно оптимизировать
-- =====================================================

-- ШАГ 1: Общий размер базы данных
-- =====================================================
SELECT
  'Общий размер БД' as metric,
  pg_size_pretty(pg_database_size(current_database())) as size,
  pg_database_size(current_database()) as size_bytes
FROM pg_database
WHERE datname = current_database();

-- ШАГ 2: Размер всех таблиц (данные + индексы + TOAST)
-- =====================================================
SELECT
  schemaname as schema,
  tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as data_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as external_size,
  pg_total_relation_size(schemaname||'.'||tablename) as total_bytes,
  pg_relation_size(schemaname||'.'||tablename) as data_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ШАГ 3: Размер индексов по таблицам
-- =====================================================
SELECT
  schemaname as schema,
  tablename as table_name,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size,
  pg_indexes_size(schemaname||'.'||tablename) as indexes_bytes
FROM pg_tables
WHERE schemaname = 'public'
  AND pg_indexes_size(schemaname||'.'||tablename) > 0
ORDER BY pg_indexes_size(schemaname||'.'||tablename) DESC;

-- ШАГ 4: Детальная информация по каждому индексу
-- =====================================================
SELECT
  schemaname as schema,
  tablename as table_name,
  indexname as index_name,
  pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size,
  pg_relation_size(schemaname||'.'||indexname) as index_bytes
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;

-- ШАГ 5: Количество записей в каждой таблице
-- =====================================================
SELECT
  'profiles' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.profiles')) as total_size
FROM profiles
UNION ALL
SELECT
  'marketplaces' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.marketplaces')) as total_size
FROM marketplaces
UNION ALL
SELECT
  'products' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.products')) as total_size
FROM products
UNION ALL
SELECT
  'reviews' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.reviews')) as total_size
FROM reviews
UNION ALL
SELECT
  'questions' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.questions')) as total_size
FROM questions
UNION ALL
SELECT
  'reply_templates' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.reply_templates')) as total_size
FROM reply_templates
UNION ALL
SELECT
  'replies' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.replies')) as total_size
FROM replies
UNION ALL
SELECT
  'audit_log' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.audit_log')) as total_size
FROM audit_log
UNION ALL
SELECT
  'logs_ai' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.logs_ai')) as total_size
FROM logs_ai
UNION ALL
SELECT
  'ai_reply_history' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.ai_reply_history')) as total_size
FROM ai_reply_history
UNION ALL
SELECT
  'ozon_performance_daily' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.ozon_performance_daily')) as total_size
FROM ozon_performance_daily
UNION ALL
SELECT
  'ozon_accruals' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.ozon_accruals')) as total_size
FROM ozon_accruals
UNION ALL
SELECT
  'storage_costs' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.storage_costs')) as total_size
FROM storage_costs
UNION ALL
SELECT
  'promotion_costs' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.promotion_costs')) as total_size
FROM promotion_costs
UNION ALL
SELECT
  'import_logs' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.import_logs')) as total_size
FROM import_logs
UNION ALL
SELECT
  'chats' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.chats')) as total_size
FROM chats
UNION ALL
SELECT
  'chat_messages' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.chat_messages')) as total_size
FROM chat_messages
UNION ALL
SELECT
  'ozon_sync_history' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.ozon_sync_history')) as total_size
FROM ozon_sync_history
UNION ALL
SELECT
  'product_business_data' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.product_business_data')) as total_size
FROM product_business_data
UNION ALL
SELECT
  'product_knowledge' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.product_knowledge')) as total_size
FROM product_knowledge
UNION ALL
SELECT
  'suppliers' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.suppliers')) as total_size
FROM suppliers
UNION ALL
SELECT
  'consent_logs' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.consent_logs')) as total_size
FROM consent_logs
UNION ALL
SELECT
  'fallback_action_logs' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.fallback_action_logs')) as total_size
FROM fallback_action_logs
ORDER BY row_count DESC;

-- ШАГ 6: Проверка дубликатов в ключевых таблицах
-- =====================================================

-- Дубликаты в reviews
SELECT
  'reviews - дубликаты' as check_name,
  COUNT(*) as total_reviews,
  COUNT(DISTINCT (marketplace_id, review_id)) as unique_reviews,
  COUNT(*) - COUNT(DISTINCT (marketplace_id, review_id)) as duplicates
FROM reviews;

-- Дубликаты в products
SELECT
  'products - дубликаты' as check_name,
  COUNT(*) as total_products,
  COUNT(DISTINCT (marketplace_id, sku)) as unique_products,
  COUNT(*) - COUNT(DISTINCT (marketplace_id, sku)) as duplicates
FROM products;

-- Дубликаты в ozon_performance_daily
SELECT
  'ozon_performance_daily - дубликаты' as check_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT (campaign_id, stat_date)) as unique_records,
  COUNT(*) - COUNT(DISTINCT (campaign_id, stat_date)) as duplicates
FROM ozon_performance_daily;

-- Дубликаты в replies
SELECT
  'replies - дубликаты' as check_name,
  COUNT(*) as total_replies,
  COUNT(DISTINCT (review_id, created_at)) as unique_replies,
  COUNT(*) - COUNT(DISTINCT (review_id, created_at)) as duplicates
FROM replies;

-- ШАГ 7: Анализ старых данных (которые можно архивировать)
-- =====================================================

-- Старые логи AI
SELECT
  'logs_ai - старые записи (>90 дней)' as category,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.logs_ai') / NULLIF(COUNT(*), 0) FROM logs_ai)
  ) as estimated_size
FROM logs_ai
WHERE created_at < NOW() - INTERVAL '90 days';

-- Старые AI reply history
SELECT
  'ai_reply_history - старые записи (>90 дней)' as category,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.ai_reply_history') / NULLIF(COUNT(*), 0) FROM ai_reply_history)
  ) as estimated_size
FROM ai_reply_history
WHERE created_at < NOW() - INTERVAL '90 days';

-- Старые audit_log
SELECT
  'audit_log - старые записи (>180 дней)' as category,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.audit_log') / NULLIF(COUNT(*), 0) FROM audit_log)
  ) as estimated_size
FROM audit_log
WHERE timestamp < NOW() - INTERVAL '180 days';

-- Старые consent_logs
SELECT
  'consent_logs - старые записи (>180 дней)' as category,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.consent_logs') / NULLIF(COUNT(*), 0) FROM consent_logs)
  ) as estimated_size
FROM consent_logs
WHERE logged_at < NOW() - INTERVAL '180 days';

-- Старые fallback_action_logs
SELECT
  'fallback_action_logs - старые записи (>180 дней)' as category,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.fallback_action_logs') / NULLIF(COUNT(*), 0) FROM fallback_action_logs)
  ) as estimated_size
FROM fallback_action_logs
WHERE logged_at < NOW() - INTERVAL '180 days';

-- Старые import_logs
SELECT
  'import_logs - старые записи (>90 дней)' as category,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.import_logs') / NULLIF(COUNT(*), 0) FROM import_logs)
  ) as estimated_size
FROM import_logs
WHERE imported_at < NOW() - INTERVAL '90 days';

-- Старые ozon_sync_history
SELECT
  'ozon_sync_history - старые записи (>90 дней)' as category,
  COUNT(*) as old_records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.ozon_sync_history') / NULLIF(COUNT(*), 0) FROM ozon_sync_history)
  ) as estimated_size
FROM ozon_sync_history
WHERE synced_at < NOW() - INTERVAL '90 days';

-- ШАГ 8: Анализ TOAST (для больших текстовых полей)
-- =====================================================
SELECT
  n.nspname as schema,
  c.relname as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_size_pretty(pg_relation_size(c.oid)) as table_size,
  pg_size_pretty(pg_total_relation_size(c.reltoastrelid)) as toast_size,
  pg_total_relation_size(c.reltoastrelid) as toast_bytes
FROM pg_class c
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.reltoastrelid != 0
  AND pg_total_relation_size(c.reltoastrelid) > 0
ORDER BY pg_total_relation_size(c.reltoastrelid) DESC;

-- ШАГ 9: Анализ самых больших записей (TOP consumers)
-- =====================================================

-- Самые большие review texts
SELECT
  'reviews - топ 10 самых длинных текстов' as category,
  id,
  LENGTH(review_text) as text_length,
  pg_size_pretty(LENGTH(review_text)) as text_size,
  created_at
FROM reviews
WHERE review_text IS NOT NULL
ORDER BY LENGTH(review_text) DESC
LIMIT 10;

-- Самые большие reply texts
SELECT
  'replies - топ 10 самых длинных текстов' as category,
  id,
  LENGTH(reply_text) as text_length,
  pg_size_pretty(LENGTH(reply_text)) as text_size,
  created_at
FROM replies
WHERE reply_text IS NOT NULL
ORDER BY LENGTH(reply_text) DESC
LIMIT 10;

-- Самые большие chat messages
SELECT
  'chat_messages - топ 10 самых длинных сообщений' as category,
  id,
  LENGTH(message) as message_length,
  pg_size_pretty(LENGTH(message)) as message_size,
  created_at
FROM chat_messages
WHERE message IS NOT NULL
ORDER BY LENGTH(message) DESC
LIMIT 10;

-- ШАГ 10: Dead tuples (неудаленные старые версии записей)
-- =====================================================
SELECT
  schemaname as schema,
  relname as table_name,
  n_dead_tup as dead_tuples,
  n_live_tup as live_tuples,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 0
ORDER BY n_dead_tup DESC;

-- ШАГ 11: Распределение данных по датам (временной анализ)
-- =====================================================

-- reviews по месяцам
SELECT
  'reviews' as table_name,
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.reviews') / NULLIF(COUNT(*), 0) FROM reviews)
  ) as estimated_size
FROM reviews
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC
LIMIT 12;

-- ozon_performance_daily по месяцам
SELECT
  'ozon_performance_daily' as table_name,
  DATE_TRUNC('month', stat_date) as month,
  COUNT(*) as records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.ozon_performance_daily') / NULLIF(COUNT(*), 0) FROM ozon_performance_daily)
  ) as estimated_size
FROM ozon_performance_daily
GROUP BY DATE_TRUNC('month', stat_date)
ORDER BY month DESC
LIMIT 12;

-- chat_messages по месяцам
SELECT
  'chat_messages' as table_name,
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as records,
  pg_size_pretty(
    COUNT(*) * (SELECT pg_total_relation_size('public.chat_messages') / NULLIF(COUNT(*), 0) FROM chat_messages)
  ) as estimated_size
FROM chat_messages
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC
LIMIT 12;

-- ШАГ 12: Summary и рекомендации
-- =====================================================
SELECT
  'ИТОГОВАЯ СТАТИСТИКА' as section,
  'Проверьте результаты выше для определения:' as recommendation,
  '1. Какие таблицы занимают больше всего места' as step1,
  '2. Есть ли дубликаты данных' as step2,
  '3. Можно ли удалить старые логи' as step3,
  '4. Нужна ли очистка TOAST или мертвых записей (VACUUM)' as step4,
  '5. Есть ли избыточные индексы' as step5;
