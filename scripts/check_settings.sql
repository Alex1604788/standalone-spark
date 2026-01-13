-- Check marketplace settings
SELECT
  id,
  marketplace_id,
  reviews_mode_1,
  reviews_mode_2,
  reviews_mode_3,
  reviews_mode_4,
  reviews_mode_5,
  use_templates_1,
  use_templates_2,
  use_templates_3,
  use_templates_4,
  use_templates_5,
  questions_mode,
  reply_length,
  created_at,
  updated_at
FROM marketplace_settings
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- Check if marketplace exists
SELECT id, name, marketplace_type FROM marketplaces WHERE id = '84b1d0f5-6750-407c-9b04-28c051972162';
