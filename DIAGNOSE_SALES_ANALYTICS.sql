-- =====================================================
-- Диагностика Sales Analytics - Почему данные = 0?
-- =====================================================

-- 1. Проверка структуры ozon_accruals
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ozon_accruals'
ORDER BY ordinal_position;

-- 2. Проверка какие типы начислений есть в базе
SELECT
  accrual_type,
  COUNT(*) as records,
  SUM(total_amount) as total_amount,
  MIN(accrual_date) as earliest,
  MAX(accrual_date) as latest
FROM ozon_accruals
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
GROUP BY accrual_type
ORDER BY records DESC;

-- 3. Проверка данных за последние 7 дней
SELECT
  accrual_date,
  accrual_type,
  COUNT(*) as records,
  SUM(total_amount) as total
FROM ozon_accruals
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
  AND accrual_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY accrual_date, accrual_type
ORDER BY accrual_date DESC;

-- 4. Проверка есть ли вообще данные в ozon_accruals
SELECT
  COUNT(*) as total_records,
  COUNT(DISTINCT offer_id) as unique_products,
  MIN(accrual_date) as earliest_date,
  MAX(accrual_date) as latest_date,
  SUM(total_amount) as total_amount
FROM ozon_accruals
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);

-- 5. Тест SQL функции напрямую за последние 7 дней
SELECT * FROM get_sales_analytics(
  (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1),
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE
) LIMIT 10;

-- 6. Проверка данных из КАЖДОГО источника отдельно
-- 6a. Sales (из ozon_accruals)
SELECT
  oa.offer_id,
  SUM(oa.total_amount) as sales_amount,
  SUM(oa.quantity) as sales_qty,
  COUNT(*) as records
FROM public.ozon_accruals oa
WHERE oa.marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
  AND oa.accrual_date >= CURRENT_DATE - INTERVAL '7 days'
  AND oa.accrual_type IN ('Доставка покупателю')
GROUP BY oa.offer_id
LIMIT 10;

-- 6b. Promotion (из ozon_performance_daily)
SELECT
  opd.offer_id,
  SUM(opd.money_spent) as promo_cost,
  COUNT(*) as records
FROM public.ozon_performance_daily opd
WHERE opd.marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
  AND opd.stat_date >= CURRENT_DATE - INTERVAL '7 days'
  AND opd.offer_id IS NOT NULL
GROUP BY opd.offer_id
LIMIT 10;

-- 6c. Storage (из storage_costs)
SELECT
  sc.offer_id,
  SUM(sc.storage_cost_amount) as stor_cost,
  COUNT(*) as records
FROM public.storage_costs sc
WHERE sc.marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
  AND sc.cost_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY sc.offer_id
LIMIT 10;

-- 7. Проверка что offer_id совпадают между таблицами
SELECT
  'ozon_accruals' as source,
  COUNT(DISTINCT offer_id) as unique_offer_ids,
  array_agg(DISTINCT offer_id ORDER BY offer_id LIMIT 5) as sample_ids
FROM ozon_accruals
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)

UNION ALL

SELECT
  'ozon_performance_daily' as source,
  COUNT(DISTINCT offer_id) as unique_offer_ids,
  array_agg(DISTINCT offer_id ORDER BY offer_id LIMIT 5) as sample_ids
FROM ozon_performance_daily
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1)
  AND offer_id IS NOT NULL

UNION ALL

SELECT
  'storage_costs' as source,
  COUNT(DISTINCT offer_id) as unique_offer_ids,
  array_agg(DISTINCT offer_id ORDER BY offer_id LIMIT 5) as sample_ids
FROM storage_costs
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);

-- 8. Проверка закупочных цен
SELECT
  COUNT(*) as total_products,
  COUNT(purchase_price) as with_price,
  COUNT(*) - COUNT(purchase_price) as without_price,
  AVG(purchase_price) as avg_price,
  array_agg(offer_id ORDER BY offer_id LIMIT 5) as sample_ids
FROM product_business_data
WHERE marketplace_id = (SELECT id FROM marketplaces WHERE is_active = true LIMIT 1);
