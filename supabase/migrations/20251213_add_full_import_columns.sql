-- =====================================================
-- Migration: Add all columns for strict template-based import
-- Date: 2025-12-13
-- Description: Добавляем все колонки для строгого импорта по шаблону
-- =====================================================

-- Add all columns to ozon_accruals (25 columns total)
ALTER TABLE public.ozon_accruals
  ADD COLUMN IF NOT EXISTS shipment_number TEXT,
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS warehouse TEXT,
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS commission_percent DECIMAL(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_assembly DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipment_processing DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS main_route DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_mile DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_main_route DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_processing DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_processing DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS undelivered_processing DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS logistics DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS localization_index TEXT,
  ADD COLUMN IF NOT EXISTS avg_delivery_hours INTEGER,
  ADD COLUMN IF NOT EXISTS return_logistics DECIMAL(10, 2) DEFAULT 0,
  -- Raw and normalized versions for accrual_type
  ADD COLUMN IF NOT EXISTS accrual_type_raw TEXT,
  ADD COLUMN IF NOT EXISTS accrual_type_norm TEXT;

-- Add all columns to storage_costs (12 columns total)
ALTER TABLE public.storage_costs
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS descriptive_type TEXT,
  ADD COLUMN IF NOT EXISTS warehouse TEXT,
  ADD COLUMN IF NOT EXISTS product_attribute TEXT,
  ADD COLUMN IF NOT EXISTS total_volume_ml INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_volume_ml INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_instances INTEGER DEFAULT 0;

-- Comments for documentation
COMMENT ON COLUMN public.ozon_accruals.accrual_type_raw IS 'Оригинальное значение "Тип начисления" из файла (для аудита)';
COMMENT ON COLUMN public.ozon_accruals.accrual_type_norm IS 'Нормализованное значение для аналитики (lower + trim + убрать двойные пробелы)';

