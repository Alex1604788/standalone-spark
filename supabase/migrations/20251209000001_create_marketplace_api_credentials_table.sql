-- =====================================================
-- Migration: Create marketplace_api_credentials table
-- Date: 2025-12-09
-- Description: Безопасное хранение API ключей маркетплейсов (OZON Performance API)
-- =====================================================

-- Create marketplace_api_credentials table
CREATE TABLE IF NOT EXISTS public.marketplace_api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Тип API
  api_type TEXT NOT NULL CHECK (api_type IN ('performance', 'seller', 'fbs', 'fbo')),

  -- Учетные данные (зашифрованы)
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,  -- В production должен быть зашифрован через Supabase Vault

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
CREATE INDEX idx_api_creds_marketplace ON public.marketplace_api_credentials(marketplace_id);
CREATE INDEX idx_api_creds_type ON public.marketplace_api_credentials(marketplace_id, api_type);
CREATE INDEX idx_api_creds_sync ON public.marketplace_api_credentials(next_sync_at)
  WHERE auto_sync_enabled = TRUE AND is_active = TRUE;

-- RLS Policies
CREATE POLICY "Users can view API credentials from own marketplaces"
  ON public.marketplace_api_credentials FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = marketplace_api_credentials.marketplace_id AND m.user_id = auth.uid()
    )
  );

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

-- Add update trigger
CREATE TRIGGER update_marketplace_api_credentials_updated_at
  BEFORE UPDATE ON public.marketplace_api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function: Check if API credentials exist
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

-- Function: Get active API credentials (для использования в Edge Functions)
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

-- Function: Update access token
CREATE OR REPLACE FUNCTION public.update_api_token(
  p_marketplace_id UUID,
  p_api_type TEXT,
  p_access_token TEXT,
  p_refresh_token TEXT DEFAULT NULL,
  p_expires_in INTEGER DEFAULT 1800  -- 30 минут по умолчанию
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

-- Function: Log sync error
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

-- Function: Reset error counter
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

-- ВАЖНО: В production рекомендуется использовать Supabase Vault для шифрования client_secret
-- Документация: https://supabase.com/docs/guides/database/vault
