-- =====================================================
-- ПОЛНАЯ АВТОМАТИЧЕСКАЯ НАСТРОЙКА OZON PERFORMANCE SYNC
-- Date: 2026-01-12
-- =====================================================
-- Этот скрипт настроит всю синхронизацию автоматически
--
-- ИНСТРУКЦИЯ:
-- 1. Скопируйте ВЕСЬ скрипт (Ctrl+A)
-- 2. Откройте Supabase Dashboard → SQL Editor
-- 3. Вставьте скрипт и нажмите RUN (F5)
-- 4. Дождитесь завершения (должны появиться зеленые галочки)
-- =====================================================

-- =====================================================
-- ШАГ 1: Настройка service_role_key для CRON
-- =====================================================
DO $$
BEGIN
  EXECUTE 'ALTER DATABASE postgres SET app.settings.supabase_url = ''https://bkmicyguzlwampuindff.supabase.co''';
  EXECUTE 'ALTER DATABASE postgres SET app.settings.service_role_key = ''eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk''';
  RAISE NOTICE '✅ Service role key настроен';
END $$;

-- =====================================================
-- ШАГ 2: Удаление старых CRON jobs
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-daily-sync') THEN
    PERFORM cron.unschedule('ozon-performance-daily-sync');
    RAISE NOTICE '✅ Удален старый CRON job: ozon-performance-daily-sync';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-weekly-sync') THEN
    PERFORM cron.unschedule('ozon-performance-weekly-sync');
    RAISE NOTICE '✅ Удален старый CRON job: ozon-performance-weekly-sync';
  END IF;
END $$;

-- =====================================================
-- ШАГ 3: Создание функции trigger_ozon_performance_sync
-- =====================================================
CREATE OR REPLACE FUNCTION public.trigger_ozon_performance_sync(
  p_marketplace_id UUID,
  p_sync_period TEXT DEFAULT 'daily'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
  v_request_id bigint;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL THEN
    v_url := 'https://bkmicyguzlwampuindff.supabase.co';
  END IF;

  IF v_service_key IS NULL THEN
    RAISE EXCEPTION 'Service role key not configured in app.settings.service_role_key';
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/sync-ozon-performance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'marketplace_id', p_marketplace_id::text,
      'sync_period', p_sync_period
    )
  ) INTO v_request_id;

  RAISE NOTICE 'Triggered sync for marketplace % (sync_period: %, request_id: %)',
    p_marketplace_id, p_sync_period, v_request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger sync for marketplace %: %', p_marketplace_id, SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_ozon_performance_sync TO postgres;

DO $$
BEGIN
  RAISE NOTICE '✅ Функция trigger_ozon_performance_sync создана';
END $$;

-- =====================================================
-- ШАГ 4: Создание новых CRON jobs
-- =====================================================
-- Ежедневная синхронизация (каждый день в 03:00 UTC = 06:00 МСК)
SELECT cron.schedule(
  'ozon-performance-daily-sync',
  '0 3 * * *',
  $$
  SELECT public.trigger_ozon_performance_sync(
    mac.marketplace_id,
    'daily'
  )
  FROM marketplace_api_credentials mac
  WHERE mac.api_type = 'performance'
    AND mac.auto_sync_enabled = true
    AND mac.is_active = true
    AND mac.client_id IS NOT NULL
    AND mac.client_secret IS NOT NULL;
  $$
);

-- Еженедельная полная синхронизация (каждое воскресенье в 04:00 UTC = 07:00 МСК)
SELECT cron.schedule(
  'ozon-performance-weekly-sync',
  '0 4 * * 0',
  $$
  SELECT public.trigger_ozon_performance_sync(
    mac.marketplace_id,
    'full'
  )
  FROM marketplace_api_credentials mac
  WHERE mac.api_type = 'performance'
    AND mac.auto_sync_enabled = true
    AND mac.is_active = true
    AND mac.client_id IS NOT NULL
    AND mac.client_secret IS NOT NULL;
  $$
);

DO $$
BEGIN
  RAISE NOTICE '✅ CRON jobs созданы (ежедневно в 03:00 UTC, еженедельно по воскресеньям в 04:00 UTC)';
END $$;

-- =====================================================
-- ШАГ 5: Найти или создать маркетплейс OZON
-- =====================================================
DO $$
DECLARE
  v_marketplace_id UUID;
  v_user_id UUID;
BEGIN
  -- Получить первого пользователя (или использовать текущего)
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Нет пользователей в системе. Сначала создайте пользователя.';
  END IF;

  -- Найти существующий OZON маркетплейс
  SELECT id INTO v_marketplace_id
  FROM marketplaces
  WHERE type = 'ozon'
    AND user_id = v_user_id
  LIMIT 1;

  -- Если не найден, создать новый
  IF v_marketplace_id IS NULL THEN
    INSERT INTO marketplaces (
      user_id,
      name,
      type,
      sync_mode,
      api_key,
      client_id
    ) VALUES (
      v_user_id,
      'OZON - Маркетплейс 1172055',
      'ozon',
      'api',
      '1765695964569@advertising.performance.ozon.ru',
      '1765695964569@advertising.performance.ozon.ru'
    )
    RETURNING id INTO v_marketplace_id;

    RAISE NOTICE '✅ Создан новый маркетплейс: %', v_marketplace_id;
  ELSE
    RAISE NOTICE '✅ Найден существующий маркетплейс: %', v_marketplace_id;
  END IF;

  -- Сохранить ID в временную таблицу для следующего шага
  CREATE TEMP TABLE IF NOT EXISTS temp_marketplace_data (marketplace_id UUID);
  DELETE FROM temp_marketplace_data;
  INSERT INTO temp_marketplace_data VALUES (v_marketplace_id);
END $$;

-- =====================================================
-- ШАГ 6: Создать/обновить API credentials
-- =====================================================
DO $$
DECLARE
  v_marketplace_id UUID;
BEGIN
  -- Получить marketplace_id из временной таблицы
  SELECT marketplace_id INTO v_marketplace_id FROM temp_marketplace_data;

  -- Создать или обновить credentials
  INSERT INTO marketplace_api_credentials (
    marketplace_id,
    api_type,
    client_id,
    client_secret,
    auto_sync_enabled,
    sync_frequency,
    is_active
  ) VALUES (
    v_marketplace_id,
    'performance',
    '1765695964569@advertising.performance.ozon.ru',
    'C-ppbpJmeIDRHnMAyBtZ6IAFFZQ81Rie_AkmcofxnaxqNND1RBemmvFWEWZo0LT8ECU6iY0n5Oyi79eXrA',
    true,
    'daily',
    true
  )
  ON CONFLICT (marketplace_id, api_type)
  DO UPDATE SET
    client_id = EXCLUDED.client_id,
    client_secret = EXCLUDED.client_secret,
    auto_sync_enabled = EXCLUDED.auto_sync_enabled,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

  RAISE NOTICE '✅ API credentials настроены для маркетплейса: %', v_marketplace_id;
END $$;

-- =====================================================
-- ШАГ 7: Проверка настроек
-- =====================================================
SELECT
  '✅ Проверка настроек' as status,
  m.id as marketplace_id,
  m.name as marketplace_name,
  m.type,
  mac.api_type,
  mac.auto_sync_enabled,
  mac.is_active,
  mac.client_id,
  '***' as client_secret_masked
FROM marketplaces m
JOIN marketplace_api_credentials mac ON mac.marketplace_id = m.id
WHERE mac.api_type = 'performance';

-- =====================================================
-- ШАГ 8: Проверка CRON jobs
-- =====================================================
SELECT
  '✅ CRON jobs настроены' as status,
  jobname,
  schedule,
  active
FROM cron.job
WHERE jobname LIKE '%ozon%'
ORDER BY jobname;

-- =====================================================
-- ШАГ 9: Тестовый запуск синхронизации
-- =====================================================
DO $$
DECLARE
  v_marketplace_id UUID;
BEGIN
  SELECT marketplace_id INTO v_marketplace_id FROM temp_marketplace_data;

  RAISE NOTICE '🚀 Запускаю тестовую синхронизацию для маркетплейса: %', v_marketplace_id;

  PERFORM public.trigger_ozon_performance_sync(
    v_marketplace_id,
    'daily'
  );

  RAISE NOTICE '✅ Тестовая синхронизация запущена!';
  RAISE NOTICE '📊 Проверить результаты можно через 2-3 минуты в таблицах:';
  RAISE NOTICE '   - ozon_sync_history (история синхронизаций)';
  RAISE NOTICE '   - ozon_performance_daily (данные по кампаниям)';
END $$;

-- Очистка временной таблицы
DROP TABLE IF EXISTS temp_marketplace_data;

-- =====================================================
-- 🎉 НАСТРОЙКА ЗАВЕРШЕНА!
-- =====================================================
-- Что произошло:
-- ✅ Service role key настроен
-- ✅ CRON jobs созданы (автосинхронизация каждый день в 03:00 UTC)
-- ✅ Маркетплейс OZON настроен
-- ✅ API credentials сохранены
-- ✅ Тестовая синхронизация запущена
--
-- Проверить результаты через 2-3 минуты:
-- SELECT * FROM ozon_sync_history ORDER BY started_at DESC LIMIT 10;
-- SELECT * FROM ozon_performance_daily ORDER BY imported_at DESC LIMIT 100;
-- =====================================================
