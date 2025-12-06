-- =====================================================
-- Migration: Create suppliers table
-- Date: 2025-12-05
-- Description: Справочник поставщиков товаров
-- =====================================================

-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Основные данные
  name TEXT NOT NULL,
  lead_time_days INTEGER DEFAULT 0,
  notes TEXT,

  -- Метаданные
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(marketplace_id, name)
);

-- Enable RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_suppliers_marketplace ON public.suppliers(marketplace_id);

-- RLS Policies
CREATE POLICY "Users can view suppliers from own marketplaces"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = suppliers.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage suppliers from own marketplaces"
  ON public.suppliers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = suppliers.marketplace_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = suppliers.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Add update trigger (using existing update_updated_at_column function)
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
