-- =====================================================
-- Migration: Add orders_model column to ozon_performance_daily
-- Date: 2025-12-22
-- Description: OZON API возвращает "Заказы" и "Заказы модели" раздельно
--              В аналитике OZON складывает эти значения
-- =====================================================

-- Add orders_model column
ALTER TABLE public.ozon_performance_daily
ADD COLUMN IF NOT EXISTS orders_model INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN public.ozon_performance_daily.orders_model IS 'Заказы модели (model orders) - суммируется с orders в аналитике OZON';

-- Verify column was added
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'ozon_performance_daily'
  AND column_name IN ('orders', 'orders_model')
ORDER BY ordinal_position;
