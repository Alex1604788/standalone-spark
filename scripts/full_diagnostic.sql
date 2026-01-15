-- Complete diagnostic for OZON auto-replies
-- VERSION: 2026-01-15-v1

-- 1. Check templates count per rating
SELECT
  'Templates by rating' as check_type,
  rating,
  COUNT(*) as template_count
FROM reply_templates
WHERE user_id IN (
  SELECT user_id FROM marketplaces
  WHERE id = '84b1d0f5-6750-407c-9b04-28c051972162'
)
AND deleted_at IS NULL
GROUP BY rating
ORDER BY rating NULLS FIRST;

-- 2. Check marketplace sync settings
SELECT
  'Marketplace settings' as check_type,
  id,
  name,
  type,
  sync_mode,
  is_active
FROM marketplaces
WHERE id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- 3. Check marketplace_settings (auto/semi modes)
SELECT
  'Auto-reply modes' as check_type,
  reviews_mode_1,
  reviews_mode_2,
  reviews_mode_3,
  reviews_mode_4,
  reviews_mode_5,
  use_templates_1,
  use_templates_2,
  use_templates_3,
  use_templates_4,
  use_templates_5
FROM marketplace_settings
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';

-- 4. Check API credentials
SELECT
  'API Credentials' as check_type,
  COUNT(*) as creds_count,
  BOOL_OR(is_active) as has_active
FROM marketplace_api_credentials
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND api_type = 'seller';

-- 5. Check reviews by segment (4-5 stars)
SELECT
  'Reviews 4-5★ by segment' as check_type,
  segment,
  COUNT(*) as count
FROM reviews
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
  AND rating IN (4, 5)
GROUP BY segment
ORDER BY segment;

-- 6. Check replies status distribution
SELECT
  'Replies by status' as check_type,
  status,
  COUNT(*) as count
FROM replies
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND deleted_at IS NULL
GROUP BY status
ORDER BY status;

-- 7. Check CRON jobs
SELECT
  'CRON jobs' as check_type,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname LIKE '%auto%' OR jobname LIKE '%reply%' OR jobname LIKE '%ozon%';
