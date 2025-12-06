-- =====================================================
-- Migration: Create promotion_costs table
-- Date: 2025-12-06
-- Description: Затраты на продвижение товаров (реклама ОЗОН)
-- =====================================================

-- Create promotion_costs table
CREATE TABLE IF NOT EXISTS public.promotion_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Период (из отчета ОЗОН, обычно за неделю или месяц)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Идентификаторы
  sku TEXT NOT NULL,        -- Из отчета ОЗОН (обычно только SKU)
  offer_id TEXT,            -- Найдем через lookup или заполним триггером

  -- Данные из отчета ОЗОН
  promotion_type TEXT,      -- "Тип продвижения"
  promotion_cost DECIMAL(10, 2) DEFAULT 0,  -- "Расход ₽ с НДС"

  -- Метрики (если есть в отчете)
  impressions INTEGER,      -- Показы
  clicks INTEGER,           -- Клики
  orders INTEGER,           -- Заказы
  revenue DECIMAL(10, 2),   -- Выручка

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, period_start, period_end, sku, promotion_type)
);

-- Enable RLS
ALTER TABLE public.promotion_costs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_promotion_costs_marketplace ON public.promotion_costs(marketplace_id);
CREATE INDEX idx_promotion_costs_period ON public.promotion_costs(marketplace_id, period_start DESC, period_end DESC);
CREATE INDEX idx_promotion_costs_sku ON public.promotion_costs(marketplace_id, sku);
CREATE INDEX idx_promotion_costs_offer ON public.promotion_costs(marketplace_id, offer_id)
  WHERE offer_id IS NOT NULL;
CREATE INDEX idx_promotion_costs_type ON public.promotion_costs(marketplace_id, promotion_type)
  WHERE promotion_type IS NOT NULL;

-- RLS Policies
CREATE POLICY "Users can view promotion costs from own marketplaces"
  ON public.promotion_costs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert promotion costs"
  ON public.promotion_costs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update promotion costs"
  ON public.promotion_costs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can delete promotion costs"
  ON public.promotion_costs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );
