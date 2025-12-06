-- =====================================================
-- Migration: Create ozon_accruals table
-- Date: 2025-12-06
-- Description: Отчет о начислениях ОЗОН (детализация по дням и типам)
-- =====================================================

-- Create ozon_accruals table
CREATE TABLE IF NOT EXISTS public.ozon_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Дата операции
  accrual_date DATE NOT NULL,

  -- Идентификаторы (offer_id главный, sku опционально)
  offer_id TEXT NOT NULL,
  sku TEXT,

  -- Данные из отчета ОЗОН
  accrual_type TEXT NOT NULL,  -- "Тип начисления" (как есть из ОЗОН)
  quantity DECIMAL(10, 3) DEFAULT 0,
  amount_before_commission DECIMAL(10, 2) DEFAULT 0,  -- "За продажу до вычета комиссий"
  total_amount DECIMAL(10, 2) DEFAULT 0,  -- "Итого"

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, accrual_date, offer_id, accrual_type)
);

-- Enable RLS
ALTER TABLE public.ozon_accruals ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_ozon_accruals_marketplace ON public.ozon_accruals(marketplace_id);
CREATE INDEX idx_ozon_accruals_date ON public.ozon_accruals(marketplace_id, accrual_date DESC);
CREATE INDEX idx_ozon_accruals_offer ON public.ozon_accruals(marketplace_id, offer_id);
CREATE INDEX idx_ozon_accruals_type ON public.ozon_accruals(marketplace_id, accrual_type);
CREATE INDEX idx_ozon_accruals_date_range ON public.ozon_accruals(marketplace_id, accrual_date)
  WHERE accrual_date >= CURRENT_DATE - INTERVAL '90 days';  -- Для быстрых запросов за последние 3 месяца

-- RLS Policies
CREATE POLICY "Users can view accruals from own marketplaces"
  ON public.ozon_accruals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert accruals"
  ON public.ozon_accruals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update accruals"
  ON public.ozon_accruals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can delete accruals"
  ON public.ozon_accruals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );
