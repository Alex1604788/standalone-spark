-- =====================================================
-- ПРОВЕРКА ДУБЛИКАТОВ В КЛЮЧЕВЫХ ТАБЛИЦАХ
-- =====================================================

-- Дубликаты в reviews
SELECT
  'reviews - дубликаты' as check_name,
  COUNT(*) as total_reviews,
  COUNT(DISTINCT (product_id, external_id)) as unique_reviews,
  COUNT(*) - COUNT(DISTINCT (product_id, external_id)) as duplicates
FROM reviews;

-- Дубликаты в products
SELECT
  'products - дубликаты' as check_name,
  COUNT(*) as total_products,
  COUNT(DISTINCT (marketplace_id, external_id)) as unique_products,
  COUNT(*) - COUNT(DISTINCT (marketplace_id, external_id)) as duplicates
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
