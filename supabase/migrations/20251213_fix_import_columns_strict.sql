-- =====================================================
-- Migration: Fix column names for strict template-based import
-- Date: 2025-12-13
-- Description: Обновляем имена полей для строгого импорта по шаблону (чтение по индексам)
-- =====================================================

-- Update ozon_accruals table with correct field names (25 columns)
-- Добавляем новые поля, если их нет

-- 1. Дата начисления (уже есть как accrual_date) ✓
-- 2. Тип начисления (уже есть как accrual_type) ✓
ALTER TABLE public.ozon_accruals
  -- 3. Номер отправления или идентификатор услуги
  ADD COLUMN IF NOT EXISTS posting_number_or_service_id TEXT,
  -- 4. Дата принятия заказа в обработку или оказания услуги
  ADD COLUMN IF NOT EXISTS accepted_or_service_date DATE,
  -- 5. Склад отгрузки
  ADD COLUMN IF NOT EXISTS warehouse TEXT,
  -- 6. SKU OZON (уже есть как sku) ✓
  -- 7. Артикул (уже есть как offer_id) ✓
  -- 8. Название товара или услуги
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  -- 9. Количество (уже есть как quantity) ✓
  -- 10. За продажу или возврат до вычета комиссий и услуг
  ADD COLUMN IF NOT EXISTS amount_before_fees DECIMAL(10, 2) DEFAULT 0,
  -- 11. Вознаграждение Ozon, %
  ADD COLUMN IF NOT EXISTS ozon_fee_percent DECIMAL(5, 2) DEFAULT 0,
  -- 12. Вознаграждение Ozon
  ADD COLUMN IF NOT EXISTS ozon_fee_amount DECIMAL(10, 2) DEFAULT 0,
  -- 13. Сборка заказа
  ADD COLUMN IF NOT EXISTS order_assembly DECIMAL(10, 2) DEFAULT 0,
  -- 14. Обработка отправления (Drop-off/Pick-up)
  ADD COLUMN IF NOT EXISTS dropoff_pickup_processing DECIMAL(10, 2) DEFAULT 0,
  -- 15. Магистраль
  ADD COLUMN IF NOT EXISTS linehaul DECIMAL(10, 2) DEFAULT 0,
  -- 16. Последняя миля
  ADD COLUMN IF NOT EXISTS last_mile DECIMAL(10, 2) DEFAULT 0,
  -- 17. Обратная магистраль
  ADD COLUMN IF NOT EXISTS reverse_linehaul DECIMAL(10, 2) DEFAULT 0,
  -- 18. Обработка возврата
  ADD COLUMN IF NOT EXISTS return_processing DECIMAL(10, 2) DEFAULT 0,
  -- 19. Обработка отмененного или невостребованного товара
  ADD COLUMN IF NOT EXISTS canceled_or_unclaimed_processing DECIMAL(10, 2) DEFAULT 0,
  -- 20. Обработка невыкупленного товара
  ADD COLUMN IF NOT EXISTS unredeemed_processing DECIMAL(10, 2) DEFAULT 0,
  -- 21. Логистика
  ADD COLUMN IF NOT EXISTS logistics DECIMAL(10, 2) DEFAULT 0,
  -- 22. Индекс локализации
  ADD COLUMN IF NOT EXISTS localization_index TEXT,
  -- 23. Среднее время доставки, часы
  ADD COLUMN IF NOT EXISTS avg_delivery_hours INTEGER,
  -- 24. Обратная логистика
  ADD COLUMN IF NOT EXISTS reverse_logistics DECIMAL(10, 2) DEFAULT 0,
  -- 25. Итого, руб.
  ADD COLUMN IF NOT EXISTS total_rub DECIMAL(10, 2) DEFAULT 0,
  -- Raw and normalized versions for accrual_type
  ADD COLUMN IF NOT EXISTS accrual_type_raw TEXT,
  ADD COLUMN IF NOT EXISTS accrual_type_norm TEXT;

-- Переименовываем старые поля для совместимости (если нужно)
-- amount_before_commission → amount_before_fees (если существует)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_schema = 'public' 
             AND table_name = 'ozon_accruals' 
             AND column_name = 'amount_before_commission'
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_schema = 'public' 
                            AND table_name = 'ozon_accruals' 
                            AND column_name = 'amount_before_fees')) THEN
    ALTER TABLE public.ozon_accruals RENAME COLUMN amount_before_commission TO amount_before_fees;
  END IF;
END $$;

-- total_amount → total_rub (если существует)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_schema = 'public' 
             AND table_name = 'ozon_accruals' 
             AND column_name = 'total_amount'
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_schema = 'public' 
                            AND table_name = 'ozon_accruals' 
                            AND column_name = 'total_rub')) THEN
    ALTER TABLE public.ozon_accruals RENAME COLUMN total_amount TO total_rub;
  END IF;
END $$;

-- Update storage_costs table with correct field names (12 columns)
ALTER TABLE public.storage_costs
  -- 1. Дата (уже есть как cost_date) ✓
  -- 2. SKU (уже есть как sku) ✓
  -- 3. Артикул (уже есть как offer_id) ✓
  -- 4. Категория товара
  ADD COLUMN IF NOT EXISTS category TEXT,
  -- 5. Описательный тип
  ADD COLUMN IF NOT EXISTS descriptive_type TEXT,
  -- 6. Склад
  ADD COLUMN IF NOT EXISTS warehouse TEXT,
  -- 7. Признак товара
  ADD COLUMN IF NOT EXISTS item_flag TEXT,
  -- 8. Суммарный объем в миллилитрах
  ADD COLUMN IF NOT EXISTS total_volume_ml INTEGER DEFAULT 0,
  -- 9. Кол-во экземпляров (уже есть как stock_quantity) ✓
  -- 10. Платный объем в миллилитрах
  ADD COLUMN IF NOT EXISTS paid_volume_ml INTEGER DEFAULT 0,
  -- 11. Кол-во платных экземпляров
  ADD COLUMN IF NOT EXISTS paid_units_count INTEGER DEFAULT 0;
  -- 12. Начисленная стоимость размещения (storage_cost → storage_cost_amount)

-- Переименовываем storage_cost → storage_cost_amount (если нужно)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_schema = 'public' 
             AND table_name = 'storage_costs' 
             AND column_name = 'storage_cost'
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                            WHERE table_schema = 'public' 
                            AND table_name = 'storage_costs' 
                            AND column_name = 'storage_cost_amount')) THEN
    ALTER TABLE public.storage_costs RENAME COLUMN storage_cost TO storage_cost_amount;
  END IF;
END $$;

-- Comments for documentation
COMMENT ON COLUMN public.ozon_accruals.accrual_type_raw IS 'Оригинальное значение "Тип начисления" из файла (для аудита)';
COMMENT ON COLUMN public.ozon_accruals.accrual_type_norm IS 'Нормализованное значение для аналитики (lower + trim + убрать двойные пробелы)';

