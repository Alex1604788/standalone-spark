-- =====================================================
-- OZON Performance API - Database Migrations
-- Apply these migrations in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- MIGRATION 1: Create marketplace_api_credentials table
-- =====================================================

-- Create marketplace_api_credentials table
CREATE TABLE IF NOT EXISTS public.marketplace_api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Тип API
  api_type TEXT NOT NULL CHECK (api_type IN ('performance', 'seller', 'fbs', 'fbo')),

  -- Учетные данные
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,

  -- Токены (автоматически обновляются)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Настройки автосинхронизации
  auto_sync_enabled BOOLEAN DEFAULT FALSE,
  sync_frequency TEXT DEFAULT 'daily' CHECK (sync_frequency IN ('hourly', 'daily', 'weekly', 'manual')),
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,

  -- Статус
  is_active BOOLEAN DEFAULT TRUE,
  last_error TEXT,
  error_count INTEGER DEFAULT 0,

  -- Метаданные
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE(marketplace_id, api_type)
);

-- Enable RLS
ALTER TABLE public.marketplace_api_credentials ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_api_creds_marketplace ON public.marketplace_api_credentials(marketplace_id);
CREATE INDEX IF NOT EXISTS idx_api_creds_type ON public.marketplace_api_credentials(marketplace_id, api_type);
CREATE INDEX IF NOT EXISTS idx_api_creds_sync ON public.marketplace_api_credentials(next_sync_at)
  WHERE auto_sync_enabled = TRUE AND is_active = TRUE;

-- RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_api_credentials' AND policyname = 'Users can view API credentials from own marketplaces'
  ) THEN
    CREATE POLICY "Users can view API credentials from own marketplaces"
      ON public.marketplace_api_credentials FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = marketplace_api_credentials.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'marketplace_api_credentials' AND policyname = 'Users can manage API credentials from own marketplaces'
  ) THEN
    CREATE POLICY "Users can manage API credentials from own marketplaces"
      ON public.marketplace_api_credentials FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = marketplace_api_credentials.marketplace_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = marketplace_api_credentials.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Add update trigger
DROP TRIGGER IF EXISTS update_marketplace_api_credentials_updated_at ON public.marketplace_api_credentials;
CREATE TRIGGER update_marketplace_api_credentials_updated_at
  BEFORE UPDATE ON public.marketplace_api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Functions
CREATE OR REPLACE FUNCTION public.has_api_credentials(
  p_marketplace_id UUID,
  p_api_type TEXT DEFAULT 'performance'
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.marketplace_api_credentials
    WHERE marketplace_id = p_marketplace_id
      AND api_type = p_api_type
      AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.has_api_credentials TO authenticated;

CREATE OR REPLACE FUNCTION public.get_api_credentials(
  p_marketplace_id UUID,
  p_api_type TEXT DEFAULT 'performance'
)
RETURNS TABLE (
  client_id TEXT,
  client_secret TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.client_id,
    c.client_secret,
    c.access_token,
    c.token_expires_at
  FROM public.marketplace_api_credentials c
  WHERE c.marketplace_id = p_marketplace_id
    AND c.api_type = p_api_type
    AND c.is_active = TRUE
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_api_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.update_api_token(
  p_marketplace_id UUID,
  p_api_type TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT DEFAULT NULL,
  p_expires_in INTEGER DEFAULT 1800
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.marketplace_api_credentials
  SET
    access_token = p_access_token,
    refresh_token = COALESCE(p_refresh_token, refresh_token),
    token_expires_at = NOW() + (p_expires_in || ' seconds')::INTERVAL,
    updated_at = NOW()
  WHERE marketplace_id = p_marketplace_id
    AND api_type = p_api_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_api_token TO service_role;

CREATE OR REPLACE FUNCTION public.log_api_sync_error(
  p_marketplace_id UUID,
  p_api_type TEXT,
  p_error_message TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.marketplace_api_credentials
  SET
    last_error = p_error_message,
    error_count = error_count + 1,
    last_sync_at = NOW(),
    updated_at = NOW()
  WHERE marketplace_id = p_marketplace_id
    AND api_type = p_api_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.log_api_sync_error TO service_role;

CREATE OR REPLACE FUNCTION public.reset_api_sync_errors(
  p_marketplace_id UUID,
  p_api_type TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.marketplace_api_credentials
  SET
    last_error = NULL,
    error_count = 0,
    updated_at = NOW()
  WHERE marketplace_id = p_marketplace_id
    AND api_type = p_api_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reset_api_sync_errors TO service_role;

-- =====================================================
-- MIGRATION 2: Create ozon_performance_daily table
-- =====================================================

-- Create ozon_performance_daily table
CREATE TABLE IF NOT EXISTS public.ozon_performance_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Дата статистики
  stat_date DATE NOT NULL,

  -- Идентификаторы товара
  sku TEXT NOT NULL,
  offer_id TEXT,

  -- Идентификаторы кампании
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_type TEXT,

  -- Основные метрики
  money_spent DECIMAL(10, 2) DEFAULT 0,
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,

  -- Дополнительные метрики
  revenue DECIMAL(10, 2),
  avg_bill DECIMAL(10, 2),
  add_to_cart INTEGER,
  favorites INTEGER,

  -- Рассчитываемые метрики
  ctr DECIMAL(5, 2),
  cpc DECIMAL(10, 2),
  conversion DECIMAL(5, 2),
  add_to_cart_conversion DECIMAL(5, 2),
  drr DECIMAL(5, 2),

  -- Дополнительные данные
  additional_data JSONB,

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, stat_date, sku, campaign_id)
);

-- Enable RLS
ALTER TABLE public.ozon_performance_daily ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_perf_marketplace ON public.ozon_performance_daily(marketplace_id);
CREATE INDEX IF NOT EXISTS idx_perf_date ON public.ozon_performance_daily(marketplace_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_perf_sku ON public.ozon_performance_daily(marketplace_id, sku);
CREATE INDEX IF NOT EXISTS idx_perf_offer ON public.ozon_performance_daily(marketplace_id, offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perf_campaign ON public.ozon_performance_daily(marketplace_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_perf_date_range ON public.ozon_performance_daily(marketplace_id, stat_date)
  WHERE stat_date >= CURRENT_DATE - INTERVAL '90 days';

-- RLS Policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ozon_performance_daily' AND policyname = 'Users can view performance data from own marketplaces'
  ) THEN
    CREATE POLICY "Users can view performance data from own marketplaces"
      ON public.ozon_performance_daily FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ozon_performance_daily' AND policyname = 'System can insert performance data'
  ) THEN
    CREATE POLICY "System can insert performance data"
      ON public.ozon_performance_daily FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ozon_performance_daily' AND policyname = 'System can update performance data'
  ) THEN
    CREATE POLICY "System can update performance data"
      ON public.ozon_performance_daily FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ozon_performance_daily' AND policyname = 'System can delete performance data'
  ) THEN
    CREATE POLICY "System can delete performance data"
      ON public.ozon_performance_daily FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Trigger: Auto-calculate metrics
CREATE OR REPLACE FUNCTION public.calculate_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- CTR % = (clicks / views) * 100
  IF NEW.views > 0 THEN
    NEW.ctr := ROUND((NEW.clicks::DECIMAL / NEW.views) * 100, 2);
  ELSE
    NEW.ctr := 0;
  END IF;

  -- CPC = money_spent / clicks
  IF NEW.clicks > 0 THEN
    NEW.cpc := ROUND(NEW.money_spent / NEW.clicks, 2);
  ELSE
    NEW.cpc := 0;
  END IF;

  -- Conversion % = (orders / clicks) * 100
  IF NEW.clicks > 0 THEN
    NEW.conversion := ROUND((NEW.orders::DECIMAL / NEW.clicks) * 100, 2);
  ELSE
    NEW.conversion := 0;
  END IF;

  -- Add to cart conversion
  IF NEW.clicks > 0 AND NEW.add_to_cart IS NOT NULL THEN
    NEW.add_to_cart_conversion := ROUND((NEW.add_to_cart::DECIMAL / NEW.clicks) * 100, 2);
  ELSE
    NEW.add_to_cart_conversion := NULL;
  END IF;

  -- ДРР %
  IF NEW.revenue IS NOT NULL AND NEW.revenue > 0 THEN
    NEW.drr := ROUND((NEW.money_spent / NEW.revenue) * 100, 2);
  ELSE
    NEW.drr := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_performance_metrics ON public.ozon_performance_daily;
CREATE TRIGGER trigger_calculate_performance_metrics
  BEFORE INSERT OR UPDATE ON public.ozon_performance_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_performance_metrics();

-- Trigger: Auto-fill offer_id from SKU
DROP TRIGGER IF EXISTS trigger_fill_offer_id_performance ON public.ozon_performance_daily;
CREATE TRIGGER trigger_fill_offer_id_performance
  BEFORE INSERT OR UPDATE ON public.ozon_performance_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_offer_id_from_sku();

-- View for aggregated costs
CREATE OR REPLACE VIEW public.promotion_costs_aggregated AS
SELECT
  marketplace_id,
  stat_date as cost_date,
  offer_id,
  sku,
  SUM(money_spent) as promotion_cost,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders) as total_orders,
  SUM(revenue) as total_revenue,
  AVG(ctr) as avg_ctr,
  AVG(cpc) as avg_cpc,
  AVG(conversion) as avg_conversion,
  AVG(drr) as avg_drr,
  MIN(imported_at) as first_imported_at,
  MAX(imported_at) as last_imported_at
FROM public.ozon_performance_daily
GROUP BY marketplace_id, stat_date, offer_id, sku;

GRANT SELECT ON public.promotion_costs_aggregated TO authenticated;

-- =====================================================
-- DONE! Tables and functions created successfully
-- =====================================================
