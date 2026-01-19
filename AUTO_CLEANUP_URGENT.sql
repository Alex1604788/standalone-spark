-- =====================================================
-- АВТОМАТИЧЕСКАЯ СРОЧНАЯ ОЧИСТКА
-- =====================================================
-- Создаёт cron job который запускается КАЖДУЮ МИНУТУ
-- Удаляет по 1000 записей
-- Через несколько дней база очистится сама
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Функция: удаляет 1000 записей старше 7 дней
CREATE OR REPLACE FUNCTION public.cleanup_audit_log_urgent()
RETURNS TABLE (deleted_count INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.audit_log
  WHERE id IN (
    SELECT id
    FROM public.audit_log
    WHERE created_at < NOW() - INTERVAL '7 days'
    ORDER BY created_at ASC
    LIMIT 1000
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  deleted_count := v_deleted;
  RETURN NEXT;
END;
$$;

-- Удаляем старые cron jobs если есть
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-audit-log-urgent') THEN
    PERFORM cron.unschedule('cleanup-audit-log-urgent');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-audit-log-hourly') THEN
    PERFORM cron.unschedule('cleanup-audit-log-hourly');
  END IF;
END $$;

-- Создаём cron job: КАЖДУЮ МИНУТУ
-- 1000 записей/минуту × 60 минут = 60,000 записей/час
-- За сутки = 1,440,000 записей
SELECT cron.schedule(
  'cleanup-audit-log-urgent',
  '* * * * *',  -- КАЖДУЮ МИНУТУ
  $$SELECT public.cleanup_audit_log_urgent();$$
);

-- Проверка
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname = 'cleanup-audit-log-urgent';

-- Показываем текущее состояние
SELECT
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as old_records,
  pg_size_pretty(pg_total_relation_size('public.audit_log')) as size
FROM public.audit_log;

-- =====================================================
-- ИТОГО:
-- ✅ Запускается каждую минуту автоматически
-- ✅ Удаляет 60,000 записей в час
-- ✅ За сутки удалит 1.4 млн записей
-- ✅ База очистится за 3-5 дней
--
-- КОГДА БАЗА ОЧИСТИТСЯ:
-- Запустите: SELECT cron.unschedule('cleanup-audit-log-urgent');
-- Затем примените: supabase/migrations/20260119_auto_cleanup_audit_log.sql
-- (для переключения на почасовую очистку)
-- =====================================================
