-- Проверка данных по SKU 3067379463 за 2025-12-04
-- Скопируйте и выполните в Supabase SQL Editor

-- 1. Проверяем что сохранилось в базе
SELECT
  stat_date as "Дата",
  sku as "SKU",
  offer_id as "Offer ID",
  campaign_id as "ID кампании",
  campaign_name as "Название кампании",
  campaign_type as "Тип кампании",
  money_spent as "Расход ₽",
  views as "Показы",
  clicks as "Клики",
  orders as "Заказы",
  revenue as "Продажи ₽",
  ctr as "CTR %",
  cpc as "CPC ₽",
  conversion_rate as "Конверсия %",
  drr as "ДРР %",
  created_at as "Создано",
  updated_at as "Обновлено"
FROM ozon_performance_daily
WHERE sku = '3067379463'
  AND stat_date >= '2025-12-04'
ORDER BY stat_date DESC, campaign_id;

-- 2. Подробная информация по всем полям
SELECT *
FROM ozon_performance_daily
WHERE sku = '3067379463'
  AND stat_date >= '2025-12-04'
ORDER BY stat_date DESC
LIMIT 10;

-- 3. Проверяем структуру таблицы
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'ozon_performance_daily'
  AND table_schema = 'public'
ORDER BY ordinal_position;
