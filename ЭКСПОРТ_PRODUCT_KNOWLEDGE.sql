-- =====================================================
-- ЭКСПОРТ ДАННЫХ ИЗ ТАБЛИЦЫ PRODUCT_KNOWLEDGE
-- =====================================================
-- Таблица product_knowledge содержит базу знаний о товарах для ИИ
-- ЭТИ ДАННЫЕ КРИТИЧНЫ - они добавляются только вручную!
-- =====================================================

-- ШАГ 1: Проверить сколько данных в таблице
-- =====================================================
SELECT
  'СТАТИСТИКА PRODUCT_KNOWLEDGE' as info,
  COUNT(*) as total_records,
  COUNT(DISTINCT product_id) as unique_products,
  COUNT(DISTINCT marketplace_id) as unique_marketplaces,
  pg_size_pretty(pg_total_relation_size('public.product_knowledge')) as table_size;

SELECT
  source_type,
  COUNT(*) as records_count
FROM public.product_knowledge
GROUP BY source_type
ORDER BY records_count DESC;

-- =====================================================
-- ВАРИАНТ 1: ЭКСПОРТ В JSON (РЕКОМЕНДУЕТСЯ)
-- =====================================================
-- Этот скрипт создаст JSON файл с ВСЕМИ данными
-- Затем скачайте файл через Supabase Dashboard

\echo '📦 Экспортирую данные в JSON формате...'

SELECT
  json_agg(
    json_build_object(
      'id', pk.id::text,
      'product_id', pk.product_id::text,
      'marketplace_id', pk.marketplace_id::text,
      'title', pk.title,
      'content', pk.content,
      'source_type', pk.source_type,
      'tags', pk.tags,
      'relevance_score', pk.relevance_score,
      'created_by', pk.created_by::text,
      'source_review_id', pk.source_review_id::text,
      'source_question_id', pk.source_question_id::text,
      'source_reply_id', pk.source_reply_id::text,
      'created_at', pk.created_at,
      'updated_at', pk.updated_at,
      -- Дополнительная информация для восстановления
      'product_external_id', p.external_id,
      'product_name', p.name
    )
    ORDER BY pk.created_at DESC
  ) as product_knowledge_backup
FROM public.product_knowledge pk
LEFT JOIN public.products p ON p.id = pk.product_id;

\echo '✅ JSON экспорт готов. Скопируйте результат в файл product_knowledge_backup.json'

-- =====================================================
-- ВАРИАНТ 2: ЭКСПОРТ В CSV
-- =====================================================
-- Этот формат легче читать в Excel/Google Sheets

\echo '📊 Экспортирую данные в CSV формате...'

\copy (SELECT id, product_id, marketplace_id, title, content, source_type, array_to_string(tags, ';') as tags, relevance_score, created_by, source_review_id, source_question_id, source_reply_id, created_at, updated_at FROM public.product_knowledge ORDER BY created_at DESC) TO 'product_knowledge_backup.csv' WITH (FORMAT CSV, HEADER, DELIMITER ',', QUOTE '"', ESCAPE '"');

\echo '✅ CSV экспорт готов в файле: product_knowledge_backup.csv'

-- =====================================================
-- ВАРИАНТ 3: ЧИТАЕМЫЙ ТЕКСТОВЫЙ ВЫВОД
-- =====================================================
-- Для быстрого просмотра и копирования

\echo '📄 Показываю данные в читаемом формате...'

SELECT
  '========================================' as separator,
  'ID: ' || pk.id::text as record_id,
  'ТОВАР: ' || COALESCE(p.name, 'Unknown') || ' (ID: ' || pk.product_id::text || ')' as product_info,
  'МАРКЕТПЛЕЙС ID: ' || pk.marketplace_id::text as marketplace,
  '----------------------------------------' as divider_1,
  'ЗАГОЛОВОК: ' || pk.title as title,
  '----------------------------------------' as divider_2,
  'КОНТЕНТ:' as content_label,
  pk.content as content,
  '----------------------------------------' as divider_3,
  'ТИП ИСТОЧНИКА: ' || pk.source_type as source,
  'ТЕГИ: ' || COALESCE(array_to_string(pk.tags, ', '), 'нет') as tags,
  'РЕЛЕВАНТНОСТЬ: ' || COALESCE(pk.relevance_score::text, 'не указана') as relevance,
  'СОЗДАН: ' || pk.created_at::text as created,
  'ОБНОВЛЕН: ' || pk.updated_at::text as updated,
  '========================================' as separator_end
FROM public.product_knowledge pk
LEFT JOIN public.products p ON p.id = pk.product_id
ORDER BY pk.created_at DESC;

-- =====================================================
-- ВАРИАНТ 4: SQL СКРИПТ ДЛЯ ВОССТАНОВЛЕНИЯ
-- =====================================================
-- Создаёт INSERT команды для восстановления данных

\echo '🔧 Генерирую SQL скрипт для восстановления...'

SELECT
  'INSERT INTO public.product_knowledge (id, product_id, marketplace_id, title, content, source_type, tags, relevance_score, created_by, source_review_id, source_question_id, source_reply_id, created_at, updated_at) VALUES (' ||
  quote_literal(id::text) || '::uuid, ' ||
  quote_literal(product_id::text) || '::uuid, ' ||
  quote_literal(marketplace_id::text) || '::uuid, ' ||
  quote_literal(title) || ', ' ||
  quote_literal(content) || ', ' ||
  quote_literal(source_type) || ', ' ||
  COALESCE('ARRAY[' || (SELECT string_agg(quote_literal(tag), ', ') FROM unnest(tags) tag) || ']::text[]', 'ARRAY[]::text[]') || ', ' ||
  COALESCE(relevance_score::text, 'NULL') || ', ' ||
  COALESCE(quote_literal(created_by::text) || '::uuid', 'NULL') || ', ' ||
  COALESCE(quote_literal(source_review_id::text) || '::uuid', 'NULL') || ', ' ||
  COALESCE(quote_literal(source_question_id::text) || '::uuid', 'NULL') || ', ' ||
  COALESCE(quote_literal(source_reply_id::text) || '::uuid', 'NULL') || ', ' ||
  quote_literal(created_at::text) || '::timestamptz, ' ||
  quote_literal(updated_at::text) || '::timestamptz);' as restore_sql
FROM public.product_knowledge
ORDER BY created_at ASC;

\echo '✅ SQL скрипт для восстановления готов'

-- =====================================================
-- ИТОГОВАЯ СТАТИСТИКА
-- =====================================================
\echo ''
\echo '📊 ИТОГОВАЯ СТАТИСТИКА:'

SELECT
  '✅ Экспорт завершён!' as status,
  COUNT(*) as total_records_exported,
  COUNT(DISTINCT product_id) as unique_products,
  COUNT(DISTINCT marketplace_id) as unique_marketplaces,
  pg_size_pretty(pg_total_relation_size('public.product_knowledge')) as total_size,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record
FROM public.product_knowledge;

\echo ''
\echo '💡 РЕКОМЕНДАЦИИ:'
\echo '1. Сохраните результаты Варианта 1 (JSON) и Варианта 4 (SQL) в отдельные файлы'
\echo '2. Создайте резервную копию в безопасном месте (Google Drive, Dropbox и т.д.)'
\echo '3. Проверьте что данные сохранены корректно перед удалением из базы'
\echo ''

-- =====================================================
-- ГОТОВО!
-- =====================================================
