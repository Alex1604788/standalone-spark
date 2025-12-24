-- Сначала удалим старые записи для SKU 3107627916 чтобы заново получить свежие данные
DELETE FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND sku = '3107627916'
  AND stat_date >= '2025-12-21'
  AND stat_date <= '2025-12-23';

-- Проверка что записи удалены
SELECT COUNT(*) as deleted_count
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND sku = '3107627916'
  AND stat_date >= '2025-12-21'
  AND stat_date <= '2025-12-23';
