-- Таблица для истории синхронизаций OZON Performance API
CREATE TABLE IF NOT EXISTS public.ozon_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Временные метки
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Статус синхронизации
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'timeout')),

  -- Тип запуска
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'cron_daily', 'cron_weekly', 'api')),
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Параметры синхронизации
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,

  -- Статистика
  campaigns_count INT,
  chunks_count INT,
  rows_inserted INT DEFAULT 0,

  -- Ошибки и повторы
  error_message TEXT,
  retries INT DEFAULT 0,

  -- Дополнительные данные (UUIDs отчетов, детали chunks, etc)
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_sync_history_marketplace ON public.ozon_sync_history(marketplace_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON public.ozon_sync_history(status);
CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON public.ozon_sync_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_history_trigger_type ON public.ozon_sync_history(trigger_type);

-- RLS политики (Row Level Security)
ALTER TABLE public.ozon_sync_history ENABLE ROW LEVEL SECURITY;

-- Пользователи видят только свои синхронизации
CREATE POLICY "Users can view own sync history"
  ON public.ozon_sync_history
  FOR SELECT
  USING (
    marketplace_id IN (
      SELECT id FROM public.marketplaces WHERE user_id = auth.uid()
    )
  );

-- Service role может все
CREATE POLICY "Service role has full access to sync history"
  ON public.ozon_sync_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION public.update_ozon_sync_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ozon_sync_history_timestamp
  BEFORE UPDATE ON public.ozon_sync_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ozon_sync_history_updated_at();

-- Комментарии для документации
COMMENT ON TABLE public.ozon_sync_history IS 'История синхронизаций данных из OZON Performance API';
COMMENT ON COLUMN public.ozon_sync_history.trigger_type IS 'Тип запуска: manual (ручная кнопка), cron_daily (ежедневный cron), cron_weekly (еженедельный cron), api (внешний API)';
COMMENT ON COLUMN public.ozon_sync_history.metadata IS 'JSON с дополнительной информацией: UUIDs отчетов OZON, детали по каждому chunk, время обработки';
COMMENT ON COLUMN public.ozon_sync_history.retries IS 'Количество повторных попыток при ошибках';
