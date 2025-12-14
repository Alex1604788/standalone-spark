-- =====================================================
-- FIX: Увеличение precision для процентных полей
-- =====================================================
-- Проблема: DECIMAL(5,2) позволяет максимум 999.99%
-- Решение: Увеличиваем до DECIMAL(10,2) для значений до 99999999.99%
--
-- Выполните в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nxymhkyvhcfcwjcfcbfy/sql/new
-- =====================================================

-- 1. Увеличиваем precision для процентных метрик
ALTER TABLE public.ozon_performance_daily
  ALTER COLUMN ctr TYPE DECIMAL(10, 2),
  ALTER COLUMN conversion TYPE DECIMAL(10, 2),
  ALTER COLUMN add_to_cart_conversion TYPE DECIMAL(10, 2),
  ALTER COLUMN drr TYPE DECIMAL(10, 2);

-- 2. Проверяем результат
SELECT
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ozon_performance_daily'
  AND column_name IN ('ctr', 'conversion', 'add_to_cart_conversion', 'drr')
ORDER BY column_name;

-- Ожидаемый результат:
-- ctr                       | numeric | 10 | 2
-- conversion                | numeric | 10 | 2
-- add_to_cart_conversion    | numeric | 10 | 2
-- drr                       | numeric | 10 | 2

-- ✅ После выполнения запустите синхронизацию "За 7 дней" снова!
