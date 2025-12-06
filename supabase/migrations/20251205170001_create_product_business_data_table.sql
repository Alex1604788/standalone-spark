-- =====================================================
-- Migration: Create product_business_data table
-- Date: 2025-12-05
-- Description: Бизнес-данные товаров (поставщик, категория, закупочная цена)
-- =====================================================

-- Create product_business_data table
CREATE TABLE IF NOT EXISTS public.product_business_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Основной ключ - offer_id (артикул продавца)
  offer_id TEXT NOT NULL,

  -- Бизнес-данные
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category TEXT,
  product_type TEXT,      -- Вид номенклатуры
  product_subtype TEXT,   -- Подвид номенклатуры
  purchase_price DECIMAL(10, 2),
  purchase_price_updated_at TIMESTAMPTZ,

  -- Флаги валидации (для страницы "Настройка номенклатуры")
  is_complete BOOLEAN DEFAULT FALSE,
  missing_fields TEXT[],  -- Массив незаполненных полей

  -- Метаданные
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(marketplace_id, offer_id)
);

-- Enable RLS
ALTER TABLE public.product_business_data ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_product_business_data_marketplace ON public.product_business_data(marketplace_id);
CREATE INDEX idx_product_business_data_offer ON public.product_business_data(marketplace_id, offer_id);
CREATE INDEX idx_product_business_data_incomplete ON public.product_business_data(marketplace_id, is_complete)
  WHERE is_complete = FALSE;
CREATE INDEX idx_product_business_data_supplier ON public.product_business_data(supplier_id)
  WHERE supplier_id IS NOT NULL;

-- RLS Policies
CREATE POLICY "Users can view product business data from own marketplaces"
  ON public.product_business_data FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_business_data.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage product business data from own marketplaces"
  ON public.product_business_data FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_business_data.marketplace_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_business_data.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Add update trigger
CREATE TRIGGER update_product_business_data_updated_at
  BEFORE UPDATE ON public.product_business_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check completeness and update missing_fields
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

  -- Update fields
  NEW.missing_fields := v_missing_fields;
  NEW.is_complete := (array_length(v_missing_fields, 1) IS NULL);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for completeness check
CREATE TRIGGER check_product_business_data_completeness_trigger
  BEFORE INSERT OR UPDATE ON public.product_business_data
  FOR EACH ROW
  EXECUTE FUNCTION public.check_product_business_data_completeness();
