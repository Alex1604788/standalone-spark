-- Добавляем cron job для автоматической ежедневной синхронизации OZON Performance данных
-- Запускается каждый день в 02:00 UTC для маркетплейсов с включенной auto_sync

-- Включаем расширение pg_cron если ещё не включено
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Удаляем старые OZON sync cron jobs если существуют
SELECT cron.unschedule('ozon-performance-daily-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-daily-sync');
SELECT cron.unschedule('ozon-performance-weekly-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ozon-performance-weekly-sync');

-- Создаём функцию для запуска ежедневной синхронизации OZON
CREATE OR REPLACE FUNCTION public.trigger_ozon_daily_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $BODY$
DECLARE
  marketplace_record RECORD;
  function_url TEXT;
  service_key TEXT;
  response TEXT;
BEGIN
  -- Получаем URL функции и service key из переменных окружения
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sync-ozon-performance';
  service_key := current_setting('app.settings.supabase_service_role_key', true);

  -- Проходим по всем маркетплейсам с включенной авто-синхронизацией
  FOR marketplace_record IN
    SELECT DISTINCT m.id as marketplace_id
    FROM public.marketplaces m
    INNER JOIN public.marketplace_api_credentials mac
      ON mac.marketplace_id = m.id
    WHERE mac.api_type = 'performance'
      AND mac.auto_sync_enabled = TRUE
      AND mac.access_token IS NOT NULL
  LOOP
    -- Вызываем Edge Function для синхронизации (sync_period='daily' - 7 дней)
    BEGIN
      PERFORM net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'marketplace_id', marketplace_record.marketplace_id,
          'sync_period', 'daily'
        )
      );

      RAISE NOTICE 'Triggered daily sync for marketplace %', marketplace_record.marketplace_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to trigger sync for marketplace %: %', marketplace_record.marketplace_id, SQLERRM;
    END;
  END LOOP;
END;
$BODY$;

-- Комментарий для функции
COMMENT ON FUNCTION public.trigger_ozon_daily_sync() IS 'Запускает ежедневную синхронизацию OZON Performance API для всех маркетплейсов с auto_sync_enabled=true';

-- Создаём cron job для ежедневной синхронизации в 02:00 UTC
SELECT cron.schedule(
  'ozon-performance-daily-sync',
  '0 2 * * *', -- Каждый день в 02:00 UTC
  $BODY$
    SELECT public.trigger_ozon_daily_sync();
  $BODY$
);

-- Комментарий для документации
COMMENT ON EXTENSION pg_cron IS 'PostgreSQL extension for scheduling jobs';
