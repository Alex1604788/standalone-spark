-- Проверка данных отзывов в базе

-- 1. Сколько всего отзывов
SELECT COUNT(*) as total_reviews
FROM reviews
WHERE deleted_at IS NULL;

-- 2. Отзывы по маркетплейсам
SELECT
  m.name as marketplace_name,
  m.type as marketplace_type,
  m.sync_mode,
  COUNT(r.id) as reviews_count
FROM reviews r
JOIN marketplaces m ON m.id = r.marketplace_id
WHERE r.deleted_at IS NULL
GROUP BY m.id, m.name, m.type, m.sync_mode
ORDER BY reviews_count DESC;

-- 3. Отзывы по сегментам
SELECT
  segment,
  COUNT(*) as count
FROM reviews
WHERE deleted_at IS NULL
GROUP BY segment;

-- 4. Отзывы без product_id
SELECT COUNT(*) as reviews_without_product
FROM reviews
WHERE deleted_at IS NULL
  AND product_id IS NULL;

-- 5. Отзывы с product_id но продукт не существует
SELECT COUNT(*) as reviews_with_missing_product
FROM reviews r
WHERE r.deleted_at IS NULL
  AND r.product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.id = r.product_id
  );

-- 6. Первые 5 отзывов для проверки структуры
SELECT
  r.id,
  r.external_id,
  r.marketplace_id,
  r.product_id,
  r.rating,
  r.segment,
  r.is_answered,
  p.name as product_name,
  p.sku as product_sku
FROM reviews r
LEFT JOIN products p ON p.id = r.product_id
WHERE r.deleted_at IS NULL
ORDER BY r.created_at DESC
LIMIT 5;
