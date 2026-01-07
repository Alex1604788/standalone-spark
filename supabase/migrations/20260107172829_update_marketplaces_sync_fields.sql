-- =====================================================
-- Update marketplaces table with sync tracking fields
-- Date: 2026-01-07
-- =====================================================

-- Add sync tracking fields
ALTER TABLE public.marketplaces
  ADD COLUMN IF NOT EXISTS last_reviews_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_questions_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_chats_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_mode TEXT DEFAULT 'plugin' CHECK (sync_mode IN ('api', 'plugin'));

-- Add comment for documentation
COMMENT ON COLUMN public.marketplaces.last_reviews_sync_at IS 'Timestamp of last reviews synchronization';
COMMENT ON COLUMN public.marketplaces.last_questions_sync_at IS 'Timestamp of last questions synchronization';
COMMENT ON COLUMN public.marketplaces.last_chats_sync_at IS 'Timestamp of last chats synchronization';
COMMENT ON COLUMN public.marketplaces.sync_mode IS 'Synchronization mode: api (Premium Plus) or plugin (fallback)';

-- Create index for API mode marketplaces
CREATE INDEX IF NOT EXISTS idx_marketplaces_sync_mode ON public.marketplaces(sync_mode) WHERE sync_mode = 'api';

-- Function to determine sync mode based on API credentials
CREATE OR REPLACE FUNCTION public.get_marketplace_sync_mode(p_marketplace_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_has_credentials BOOLEAN;
BEGIN
  -- Check if marketplace has active API credentials
  SELECT EXISTS (
    SELECT 1
    FROM public.marketplace_api_credentials
    WHERE marketplace_id = p_marketplace_id
      AND api_type = 'seller'
      AND is_active = TRUE
      AND client_id IS NOT NULL
      AND client_secret IS NOT NULL
  ) INTO v_has_credentials;

  IF v_has_credentials THEN
    RETURN 'api';
  ELSE
    RETURN 'plugin';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_marketplace_sync_mode TO authenticated;

-- Function to auto-update sync_mode when API credentials change
CREATE OR REPLACE FUNCTION public.update_marketplace_sync_mode()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.marketplaces
    SET sync_mode = CASE
      WHEN NEW.is_active = TRUE AND NEW.client_id IS NOT NULL AND NEW.client_secret IS NOT NULL
      THEN 'api'
      ELSE 'plugin'
    END
    WHERE id = NEW.marketplace_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.marketplaces
    SET sync_mode = 'plugin'
    WHERE id = OLD.marketplace_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update sync_mode when credentials change
DROP TRIGGER IF EXISTS trigger_update_marketplace_sync_mode ON public.marketplace_api_credentials;
CREATE TRIGGER trigger_update_marketplace_sync_mode
  AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_api_credentials
  FOR EACH ROW
  WHEN (
    (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.api_type = 'seller'
    OR (TG_OP = 'DELETE' AND OLD.api_type = 'seller')
  )
  EXECUTE FUNCTION public.update_marketplace_sync_mode();

-- Update existing marketplaces sync_mode based on current credentials
UPDATE public.marketplaces m
SET sync_mode = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.marketplace_api_credentials c
    WHERE c.marketplace_id = m.id
      AND c.api_type = 'seller'
      AND c.is_active = TRUE
      AND c.client_id IS NOT NULL
      AND c.client_secret IS NOT NULL
  ) THEN 'api'
  ELSE 'plugin'
END;

-- =====================================================
-- DONE! Marketplaces sync tracking fields added
-- =====================================================
