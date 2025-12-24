-- ПОЛНАЯ ОЧИСТКА данных OZON Performance для маркетплейса КРАФТМАН
-- Marketplace ID: 84b1d0f5-6750-407c-9b04-28c051972162

-- Показать сколько записей будет удалено
SELECT 
    COUNT(*) as total_records,
    MIN(stat_date) as oldest_date,
    MAX(stat_date) as newest_date,
    COUNT(DISTINCT sku) as unique_skus
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- Удалить ВСЕ записи для этого маркетплейса
DELETE FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- Проверка что таблица пуста
SELECT COUNT(*) as remaining_records
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';
