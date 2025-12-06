-- =====================================================
-- Migration: Create volume tracking tables
-- Date: 2025-12-06
-- Description: Таблицы для отслеживания объемных характеристик товаров (литраж)
-- =====================================================

-- Create product_volume_standards table (эталонные значения)
CREATE TABLE IF NOT EXISTS public.product_volume_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  offer_id TEXT NOT NULL,

  -- Эталонные значения (устанавливаются пользователем)
  standard_volume_liters DECIMAL(10, 3),
  standard_weight_kg DECIMAL(10, 3),
  standard_length_cm DECIMAL(10, 2),
  standard_width_cm DECIMAL(10, 2),
  standard_height_cm DECIMAL(10, 2),

  -- Допустимое отклонение (%)
  tolerance_percent DECIMAL(5, 2) DEFAULT 5.0,

  -- Метаданные
  set_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(marketplace_id, offer_id)
);

-- Create product_volume_history table (история измерений)
CREATE TABLE IF NOT EXISTS public.product_volume_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  offer_id TEXT NOT NULL,
  sku TEXT NOT NULL,

  -- Объемные характеристики (из API ОЗОН)
  volume_liters DECIMAL(10, 3),
  weight_kg DECIMAL(10, 3),
  length_cm DECIMAL(10, 2),
  width_cm DECIMAL(10, 2),
  height_cm DECIMAL(10, 2),

  -- Отклонение от эталона
  is_different_from_standard BOOLEAN DEFAULT FALSE,

  -- Дата и источник
  measured_date DATE NOT NULL,
  data_source TEXT DEFAULT 'ozon_api',  -- 'ozon_api', 'manual'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(marketplace_id, offer_id, measured_date)
);

-- Enable RLS
ALTER TABLE public.product_volume_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_volume_history ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_volume_standards_marketplace ON public.product_volume_standards(marketplace_id);
CREATE INDEX idx_volume_standards_offer ON public.product_volume_standards(marketplace_id, offer_id);

CREATE INDEX idx_volume_history_marketplace ON public.product_volume_history(marketplace_id);
CREATE INDEX idx_volume_history_offer ON public.product_volume_history(marketplace_id, offer_id, measured_date DESC);
CREATE INDEX idx_volume_history_different ON public.product_volume_history(marketplace_id, is_different_from_standard)
  WHERE is_different_from_standard = TRUE;

-- RLS Policies for product_volume_standards
CREATE POLICY "Users can view volume standards from own marketplaces"
  ON public.product_volume_standards FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_standards.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage volume standards from own marketplaces"
  ON public.product_volume_standards FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_standards.marketplace_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_standards.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for product_volume_history
CREATE POLICY "Users can view volume history from own marketplaces"
  ON public.product_volume_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_history.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert volume history"
  ON public.product_volume_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_history.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Add update trigger for standards
CREATE TRIGGER update_volume_standards_updated_at
  BEFORE UPDATE ON public.product_volume_standards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create view for current volume status
CREATE OR REPLACE VIEW public.product_current_volume AS
WITH latest_measurements AS (
  SELECT DISTINCT ON (marketplace_id, offer_id)
    marketplace_id,
    offer_id,
    sku,
    volume_liters,
    weight_kg,
    length_cm,
    width_cm,
    height_cm,
    measured_date,
    is_different_from_standard,
    data_source
  FROM public.product_volume_history
  ORDER BY marketplace_id, offer_id, measured_date DESC
)
SELECT
  lm.*,
  pvs.standard_volume_liters,
  pvs.standard_weight_kg,
  pvs.tolerance_percent,
  CASE
    WHEN pvs.standard_volume_liters IS NOT NULL AND lm.volume_liters IS NOT NULL
    THEN ABS(lm.volume_liters - pvs.standard_volume_liters) / pvs.standard_volume_liters * 100
    ELSE NULL
  END as deviation_percent,
  CASE
    WHEN pvs.standard_volume_liters IS NOT NULL AND lm.volume_liters IS NOT NULL
    THEN ABS(lm.volume_liters - pvs.standard_volume_liters) / pvs.standard_volume_liters * 100 > pvs.tolerance_percent
    ELSE FALSE
  END as exceeds_tolerance
FROM latest_measurements lm
LEFT JOIN public.product_volume_standards pvs
  ON lm.marketplace_id = pvs.marketplace_id
  AND lm.offer_id = pvs.offer_id;
