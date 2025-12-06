-- =====================================================
-- Migration: Create import_logs table
-- Date: 2025-12-06
-- Description: История загрузок файлов и импорта данных
-- =====================================================

-- Create import_logs table
CREATE TABLE IF NOT EXISTS public.import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Тип импорта
  import_type TEXT NOT NULL,  -- 'accruals', 'storage_costs', 'promotion_costs', 'business_data'
  file_name TEXT,
  period_start DATE,
  period_end DATE,

  -- Статус
  status TEXT DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
  records_imported INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,

  -- Метаданные
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_import_logs_marketplace ON public.import_logs(marketplace_id, import_type, created_at DESC);
CREATE INDEX idx_import_logs_status ON public.import_logs(marketplace_id, status)
  WHERE status = 'processing';
CREATE INDEX idx_import_logs_user ON public.import_logs(user_id)
  WHERE user_id IS NOT NULL;

-- RLS Policies
CREATE POLICY "Users can view import logs from own marketplaces"
  ON public.import_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = import_logs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create import logs for own marketplaces"
  ON public.import_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = import_logs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update import logs for own marketplaces"
  ON public.import_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = import_logs.marketplace_id AND m.user_id = auth.uid()
    )
  );
