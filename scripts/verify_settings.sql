-- Verify marketplace settings are correct
SELECT
  m.id as marketplace_id,
  m.name as marketplace_name,
  m.type as marketplace_type,
  ms.reviews_mode_1,
  ms.reviews_mode_2,
  ms.reviews_mode_3,
  ms.reviews_mode_4,  -- ДОЛЖНО БЫТЬ 'auto'
  ms.reviews_mode_5,  -- ДОЛЖНО БЫТЬ 'auto'
  ms.use_templates_1,
  ms.use_templates_2,
  ms.use_templates_3,
  ms.use_templates_4,
  ms.use_templates_5,
  ms.questions_mode,
  ms.reply_length,
  ms.updated_at
FROM marketplaces m
LEFT JOIN marketplace_settings ms ON ms.marketplace_id = m.id
WHERE m.user_id = '34458753-5070-4f35-86a2-3e8ccbec6e38'
  AND m.type = 'ozon';
