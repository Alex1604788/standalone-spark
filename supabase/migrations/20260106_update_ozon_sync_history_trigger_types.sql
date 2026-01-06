-- Обновляем trigger_type constraint для поддержки 'manual_full'
-- Новый тип: manual_full - полная синхронизация за 62 дня с auto-continue

ALTER TABLE public.ozon_sync_history
DROP CONSTRAINT IF EXISTS ozon_sync_history_trigger_type_check;

ALTER TABLE public.ozon_sync_history
ADD CONSTRAINT ozon_sync_history_trigger_type_check
CHECK (trigger_type IN ('manual', 'manual_full', 'cron_daily', 'cron_weekly', 'api'));

-- Обновляем комментарий
COMMENT ON COLUMN public.ozon_sync_history.trigger_type IS 'Тип запуска: manual (ручная кнопка), manual_full (полная синхронизация 62 дня), cron_daily (ежедневный cron 7 дней), cron_weekly (legacy), api (внешний API)';
