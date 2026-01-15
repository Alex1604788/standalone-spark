-- Проверка индексов на таблице reviews

-- 1. Все индексы на таблице reviews
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'reviews'
ORDER BY indexname;

-- 2. Размер таблицы reviews
SELECT
    pg_size_pretty(pg_total_relation_size('reviews')) as total_size,
    pg_size_pretty(pg_relation_size('reviews')) as table_size,
    pg_size_pretty(pg_total_relation_size('reviews') - pg_relation_size('reviews')) as indexes_size;

-- 3. Количество записей
SELECT COUNT(*) as total_rows FROM reviews;

-- 4. Проверка статистики по индексам (используются ли они)
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'reviews'
ORDER BY idx_scan DESC;
