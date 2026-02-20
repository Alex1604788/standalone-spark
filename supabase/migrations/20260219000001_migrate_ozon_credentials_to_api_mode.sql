-- =====================================================
-- Migration: Copy existing ozon_credentials to marketplace_api_credentials
-- Date: 2026-02-19
-- Description:
--   Пользователи, подключившие Ozon API через ConnectOzonAPI.tsx,
--   имеют ключи только в ozon_credentials.
--   publish-reply определяет режим (api/plugin) через marketplace_api_credentials.
--   Эта миграция копирует существующие ключи, чтобы sync_mode стал 'api'
--   и publish-reply начал публиковать через API вместо плагина.
-- =====================================================

-- Copy existing ozon_credentials into marketplace_api_credentials (api_type='seller')
-- client_secret = api_key (ozon api key stored as client_secret for publish-reply compatibility)
INSERT INTO public.marketplace_api_credentials (
  marketplace_id,
  api_type,
  client_id,
  client_secret,
  is_active,
  created_at,
  updated_at
)
SELECT
  oc.marketplace_id,
  'seller'                      AS api_type,
  oc.client_id,
  oc.api_key                    AS client_secret,
  TRUE                          AS is_active,
  oc.created_at,
  oc.updated_at
FROM public.ozon_credentials oc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.marketplace_api_credentials mac
  WHERE mac.marketplace_id = oc.marketplace_id
    AND mac.api_type = 'seller'
);

-- Update sync_mode for all ozon marketplaces that now have seller credentials
-- (the trigger handles new inserts, but we run this for the migrated rows)
UPDATE public.marketplaces m
SET sync_mode = 'api'
WHERE m.type = 'ozon'
  AND EXISTS (
    SELECT 1
    FROM public.marketplace_api_credentials mac
    WHERE mac.marketplace_id = m.id
      AND mac.api_type = 'seller'
      AND mac.is_active = TRUE
      AND mac.client_id IS NOT NULL
      AND mac.client_secret IS NOT NULL
  );

-- =====================================================
-- RESULT: Existing users with Ozon API keys are now
-- automatically switched to API mode (sync_mode='api')
-- =====================================================
