-- Проверка OZON Performance API credentials
-- Выполните этот запрос в Supabase SQL Editor

SELECT
  marketplace_id,
  api_type,
  client_id,
  LENGTH(client_secret) as secret_length,
  SUBSTRING(client_secret, 1, 10) || '...' as secret_preview,
  token_expires_at,
  created_at,
  updated_at
FROM marketplace_api_credentials
WHERE api_type = 'performance';

-- Проверка формата:
-- Client ID должен выглядеть как число или UUID
-- Client Secret должен быть длинной строкой (обычно 40+ символов)
