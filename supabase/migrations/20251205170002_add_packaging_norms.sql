-- =====================================================
-- Migration: Add packaging norms to product_business_data
-- Date: 2025-12-05
-- Description: Добавляем нормы упаковки (малая и большая коробка)
-- =====================================================

-- Add packaging fields to product_business_data
ALTER TABLE public.product_business_data
ADD COLUMN IF NOT EXISTS small_box_quantity INTEGER,  -- Количество единиц в малой коробке
ADD COLUMN IF NOT EXISTS large_box_quantity INTEGER,  -- Количество единиц в большой коробке
ADD COLUMN IF NOT EXISTS packaging_notes TEXT;        -- Примечания по упаковке

-- Update completeness check function
CREATE OR REPLACE FUNCTION public.check_product_business_data_completeness()
RETURNS TRIGGER AS $$
DECLARE
  v_missing_fields TEXT[] := '{}';
BEGIN
  -- Check required fields
  IF NEW.supplier_id IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'supplier_id');
  END IF;

  IF NEW.category IS NULL OR NEW.category = '' THEN
    v_missing_fields := array_append(v_missing_fields, 'category');
  END IF;

  IF NEW.purchase_price IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'purchase_price');
  END IF;

  -- Optional but recommended fields
  IF NEW.small_box_quantity IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'small_box_quantity');
  END IF;

  IF NEW.large_box_quantity IS NULL THEN
    v_missing_fields := array_append(v_missing_fields, 'large_box_quantity');
  END IF;

  -- Update fields
  NEW.missing_fields := v_missing_fields;
  NEW.is_complete := (array_length(v_missing_fields, 1) IS NULL OR array_length(v_missing_fields, 1) <= 2);
  -- Допускаем до 2 незаполненных полей (упаковки опциональны)

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create helper view for packaging calculations
CREATE OR REPLACE VIEW public.product_packaging_info AS
SELECT
  pbd.marketplace_id,
  pbd.offer_id,
  pbd.small_box_quantity,
  pbd.large_box_quantity,
  -- Вычисляем сколько малых коробок в большой
  CASE
    WHEN pbd.small_box_quantity > 0 AND pbd.large_box_quantity > 0
    THEN pbd.large_box_quantity / pbd.small_box_quantity
    ELSE NULL
  END as small_boxes_per_large_box,
  pbd.packaging_notes
FROM public.product_business_data pbd
WHERE pbd.small_box_quantity IS NOT NULL
   OR pbd.large_box_quantity IS NOT NULL;

-- Function: Calculate boxes needed for order
CREATE OR REPLACE FUNCTION public.calculate_boxes_needed(
  p_offer_id TEXT,
  p_marketplace_id UUID,
  p_quantity INTEGER
) RETURNS TABLE (
  large_boxes INTEGER,
  small_boxes INTEGER,
  loose_units INTEGER,
  total_units INTEGER
) AS $$
DECLARE
  v_small_box_qty INTEGER;
  v_large_box_qty INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Get packaging info
  SELECT small_box_quantity, large_box_quantity
  INTO v_small_box_qty, v_large_box_qty
  FROM public.product_business_data
  WHERE offer_id = p_offer_id
    AND marketplace_id = p_marketplace_id;

  -- Calculate boxes
  v_remaining := p_quantity;

  -- First, fill large boxes if available
  IF v_large_box_qty IS NOT NULL AND v_large_box_qty > 0 THEN
    large_boxes := v_remaining / v_large_box_qty;
    v_remaining := v_remaining % v_large_box_qty;
  ELSE
    large_boxes := 0;
  END IF;

  -- Then, fill small boxes if available
  IF v_small_box_qty IS NOT NULL AND v_small_box_qty > 0 THEN
    small_boxes := v_remaining / v_small_box_qty;
    v_remaining := v_remaining % v_small_box_qty;
  ELSE
    small_boxes := 0;
  END IF;

  -- Remaining loose units
  loose_units := v_remaining;
  total_units := p_quantity;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON public.product_packaging_info TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_boxes_needed TO authenticated;

-- Comment on fields
COMMENT ON COLUMN public.product_business_data.small_box_quantity IS 'Количество единиц товара в малой коробке';
COMMENT ON COLUMN public.product_business_data.large_box_quantity IS 'Количество единиц товара в большой коробке (обычно кратно малой)';
COMMENT ON COLUMN public.product_business_data.packaging_notes IS 'Дополнительная информация об упаковке';
