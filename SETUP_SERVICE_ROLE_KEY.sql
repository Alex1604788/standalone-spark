-- =====================================================
-- Настройка Service Role Key для CRON Jobs
-- Date: 2026-01-12
-- =====================================================
-- Этот скрипт настраивает service_role_key для автоматических
-- CRON jobs синхронизации OZON Performance API
--
-- ВАЖНО: Выполнить этот скрипт в Supabase Dashboard → SQL Editor
-- =====================================================

-- Установить Supabase URL (замените на ваш)
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://bkmicyguzlwampuindff.supabase.co';

-- Установить Service Role Key
-- ВАЖНО: Замените значение ниже на ваш актуальный service_role key
ALTER DATABASE postgres SET app.settings.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

-- Проверить настройки
SELECT
  name,
  setting
FROM pg_settings
WHERE name LIKE 'app.settings.%';

-- =====================================================
-- ГОТОВО!
-- Теперь CRON jobs будут использовать service_role key
-- для вызова Edge Functions
-- =====================================================

-- Для ручного тестирования синхронизации:
-- SELECT public.trigger_ozon_performance_sync(
--   'YOUR_MARKETPLACE_ID'::uuid,
--   'daily'
-- );
