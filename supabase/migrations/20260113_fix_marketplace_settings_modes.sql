-- Fix marketplace settings: set auto mode for 4-5 stars, semi for 1-3 stars
-- This ensures proper automatic reply generation for positive reviews

DO $$
DECLARE
  v_marketplace_id UUID;
BEGIN
  -- Get OZON marketplace ID for user
  SELECT id INTO v_marketplace_id
  FROM marketplaces
  WHERE user_id = '34458753-5070-4f35-86a2-3e8ccbec6e38'
    AND type = 'ozon'
  LIMIT 1;

  IF v_marketplace_id IS NOT NULL THEN
    -- Check if settings exist
    IF EXISTS (SELECT 1 FROM marketplace_settings WHERE marketplace_id = v_marketplace_id) THEN
      -- Update existing settings
      UPDATE marketplace_settings
      SET
        reviews_mode_1 = 'semi',  -- 1 star: semi-auto (requires confirmation)
        reviews_mode_2 = 'semi',  -- 2 stars: semi-auto
        reviews_mode_3 = 'semi',  -- 3 stars: semi-auto
        reviews_mode_4 = 'auto',  -- 4 stars: AUTO (no confirmation needed)
        reviews_mode_5 = 'auto',  -- 5 stars: AUTO (no confirmation needed)
        use_templates_1 = true,   -- Use templates for all ratings
        use_templates_2 = true,
        use_templates_3 = true,
        use_templates_4 = true,
        use_templates_5 = true,
        questions_mode = 'off',   -- Questions mode off
        reply_length = 'short',   -- Short replies (up to 200 chars)
        updated_at = NOW()
      WHERE marketplace_id = v_marketplace_id;

      RAISE NOTICE 'Updated settings for marketplace %', v_marketplace_id;
    ELSE
      -- Insert new settings
      INSERT INTO marketplace_settings (
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
        reply_length
      ) VALUES (
        v_marketplace_id,
        'semi',  -- 1-3 stars: semi-auto
        'semi',
        'semi',
        'auto',  -- 4-5 stars: auto
        'auto',
        true,    -- Use templates for all
        true,
        true,
        true,
        true,
        'off',   -- Questions off
        'short'  -- Short replies
      );

      RAISE NOTICE 'Created settings for marketplace %', v_marketplace_id;
    END IF;
  ELSE
    RAISE WARNING 'Marketplace not found for user 34458753-5070-4f35-86a2-3e8ccbec6e38';
  END IF;
END $$;

-- Verify settings
SELECT
  m.name as marketplace_name,
  ms.reviews_mode_1,
  ms.reviews_mode_2,
  ms.reviews_mode_3,
  ms.reviews_mode_4,
  ms.reviews_mode_5,
  ms.use_templates_1,
  ms.use_templates_2,
  ms.use_templates_3,
  ms.use_templates_4,
  ms.use_templates_5,
  ms.questions_mode,
  ms.reply_length
FROM marketplace_settings ms
JOIN marketplaces m ON m.id = ms.marketplace_id
WHERE m.user_id = '34458753-5070-4f35-86a2-3e8ccbec6e38';
