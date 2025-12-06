-- =====================================================
-- Migration: Create storage_costs table
-- Date: 2025-12-06
-- Description: Стоимость размещения товаров на складе ОЗОН + остатки
-- =====================================================

-- Create storage_costs table
CREATE TABLE IF NOT EXISTS public.storage_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Дата
  cost_date DATE NOT NULL,

  -- Идентификаторы
  offer_id TEXT NOT NULL,
  sku TEXT,

  -- Данные из отчета ОЗОН
  storage_cost DECIMAL(10, 2) DEFAULT 0,  -- "Начисленная стоимость размещения"
  stock_quantity INTEGER DEFAULT 0,       -- "Кол-во экземпляров" (остаток на складе)

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, cost_date, offer_id)
);

-- Enable RLS
ALTER TABLE public.storage_costs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_storage_costs_marketplace ON public.storage_costs(marketplace_id);
CREATE INDEX idx_storage_costs_date ON public.storage_costs(marketplace_id, cost_date DESC);
CREATE INDEX idx_storage_costs_offer ON public.storage_costs(marketplace_id, offer_id);
CREATE INDEX idx_storage_costs_date_range ON public.storage_costs(marketplace_id, cost_date)
  WHERE cost_date >= CURRENT_DATE - INTERVAL '90 days';

-- RLS Policies
CREATE POLICY "Users can view storage costs from own marketplaces"
  ON public.storage_costs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert storage costs"
  ON public.storage_costs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update storage costs"
  ON public.storage_costs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can delete storage costs"
  ON public.storage_costs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );
