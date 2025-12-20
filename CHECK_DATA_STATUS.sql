-- =====================================================
-- Проверка наличия данных для Sales Analytics
-- Выполните эти запросы в Supabase SQL Editor
-- =====================================================

-- 1. Проверка данных в ozon_performance_daily (Performance API)
-- Затраты на продвижение
SELECT
  '1. OZON Performance (продвижение)' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT campaign_id) as campaigns,
  COUNT(DISTINCT sku) as unique_sku,
  COUNT(DISTINCT offer_id) as unique_offer_id,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date,
  SUM(money_spent)::DECIMAL(10,2) as total_spent
FROM ozon_performance_daily
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);

-- 2. Проверка данных в ozon_accruals (Начисления ОЗОН)
-- Продажи и эквайринг
SELECT
  '2. OZON Accruals (начисления)' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT offer_id) as unique_products,
  COUNT(DISTINCT accrual_type) as unique_types,
  MIN(accrual_date) as earliest_date,
  MAX(accrual_date) as latest_date
FROM ozon_accruals
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);

-- 2.1. Разбивка по типам начислений
SELECT
  accrual_type,
  COUNT(*) as records,
  SUM(total_amount)::DECIMAL(10,2) as total_amount,
  SUM(quantity)::DECIMAL(10,2) as total_quantity
FROM ozon_accruals
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
GROUP BY accrual_type
ORDER BY total_amount DESC;

-- 3. Проверка данных в storage_costs (Стоимость размещения)
SELECT
  '3. Storage Costs (размещение)' as table_name,
  COUNT(*) as total_rows,
  COUNT(DISTINCT offer_id) as unique_products,
  MIN(cost_date) as earliest_date,
  MAX(cost_date) as latest_date,
  SUM(storage_cost)::DECIMAL(10,2) as total_cost,
  SUM(stock_quantity) as total_stock
FROM storage_costs
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);

-- 4. Проверка product_business_data (Закупочные цены)
SELECT
  '4. Product Business Data (номенклатура)' as table_name,
  COUNT(*) as total_products,
  COUNT(purchase_price) as with_purchase_price,
  COUNT(*) - COUNT(purchase_price) as missing_purchase_price,
  COUNT(supplier_id) as with_supplier,
  COUNT(category) as with_category
FROM product_business_data
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);

-- 5. Проверка соответствия offer_id между таблицами
SELECT
  '5. Offer ID mapping' as check_name,
  COUNT(DISTINCT opd.sku) as performance_sku_count,
  COUNT(DISTINCT opd.offer_id) as performance_offer_id_count,
  COUNT(DISTINCT opd.offer_id) FILTER (WHERE opd.offer_id IS NULL) as null_offer_ids,
  COUNT(DISTINCT p.offer_id) as products_count
FROM ozon_performance_daily opd
LEFT JOIN products p ON p.offer_id = opd.offer_id
  AND p.marketplace_id = opd.marketplace_id
WHERE opd.marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);

-- 6. Топ-10 товаров по затратам на продвижение (с названиями)
SELECT
  opd.sku,
  opd.offer_id,
  p.name as product_name,
  COUNT(DISTINCT opd.campaign_id) as campaigns,
  SUM(opd.money_spent)::DECIMAL(10,2) as total_spent,
  SUM(opd.views) as total_views,
  SUM(opd.clicks) as total_clicks,
  SUM(opd.orders) as total_orders
FROM ozon_performance_daily opd
LEFT JOIN products p ON p.offer_id = opd.offer_id
  AND p.marketplace_id = opd.marketplace_id
WHERE opd.marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
GROUP BY opd.sku, opd.offer_id, p.name
ORDER BY total_spent DESC
LIMIT 10;

-- 7. Проверка товаров без закупочной цены (которые есть в Performance API)
SELECT
  opd.offer_id,
  p.name as product_name,
  pbd.purchase_price,
  SUM(opd.money_spent)::DECIMAL(10,2) as promo_spent
FROM ozon_performance_daily opd
LEFT JOIN products p ON p.offer_id = opd.offer_id
  AND p.marketplace_id = opd.marketplace_id
LEFT JOIN product_business_data pbd ON pbd.offer_id = opd.offer_id
  AND pbd.marketplace_id = opd.marketplace_id
WHERE opd.marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
  AND opd.offer_id IS NOT NULL
  AND pbd.purchase_price IS NULL
GROUP BY opd.offer_id, p.name, pbd.purchase_price
ORDER BY promo_spent DESC
LIMIT 20;

-- 8. Тестовый запрос get_sales_analytics за последние 7 дней
SELECT
  sa.offer_id,
  p.name as product_name,
  sa.total_sales,
  sa.total_quantity,
  sa.total_promotion_cost,
  sa.total_storage_cost,
  pbd.purchase_price,
  -- Рассчитываем валовку
  (sa.total_sales - (pbd.purchase_price * sa.total_quantity))::DECIMAL(10,2) as gross_profit,
  -- Рассчитываем итоговую маржу
  (sa.total_sales - (pbd.purchase_price * sa.total_quantity) - sa.total_promotion_cost - sa.total_storage_cost)::DECIMAL(10,2) as net_margin
FROM get_sales_analytics(
  (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1),
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE
) sa
LEFT JOIN products p ON p.offer_id = sa.offer_id
LEFT JOIN product_business_data pbd ON pbd.offer_id = sa.offer_id
ORDER BY sa.total_sales DESC
LIMIT 20;

-- =====================================================
-- ИТОГОВАЯ СВОДКА
-- =====================================================
SELECT
  'SUMMARY' as status,
  (SELECT COUNT(*) FROM ozon_performance_daily WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)) as performance_rows,
  (SELECT COUNT(*) FROM ozon_accruals WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)) as accruals_rows,
  (SELECT COUNT(*) FROM storage_costs WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)) as storage_rows,
  (SELECT COUNT(*) FROM product_business_data WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)) as business_data_rows,
  CASE
    WHEN (SELECT COUNT(*) FROM ozon_accruals WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)) > 0 THEN '✅'
    ELSE '❌ Импортировать начисления'
  END as accruals_status,
  CASE
    WHEN (SELECT COUNT(*) FROM storage_costs WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)) > 0 THEN '✅'
    ELSE '❌ Импортировать стоимость размещения'
  END as storage_status,
  CASE
    WHEN (SELECT COUNT(*) - COUNT(purchase_price) FROM product_business_data WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)) = 0 THEN '✅'
    ELSE '⚠️ Заполнить закупочные цены'
  END as prices_status;
