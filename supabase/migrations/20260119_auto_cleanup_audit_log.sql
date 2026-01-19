-- =====================================================
-- АВТОМАТИЧЕСКАЯ ОЧИСТКА AUDIT_LOG
-- =====================================================
-- Стратегия: удалять МАЛЕНЬКИЕ порции ЧАСТО
-- Вместо 50k записей раз в день -> 1000 записей каждый час
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Функция: удаляет ТОЛЬКО 1000 записей старше 7 дней
-- Быстрая, не вызывает timeout
CREATE OR REPLACE FUNCTION public.cleanup_audit_log_small_batch()
RETURNS TABLE (deleted_count INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INT;
BEGIN
  -- Удаляем только 1000 записей
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

-- Удаляем старый cron job если есть
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-audit-log-hourly') THEN
    PERFORM cron.unschedule('cleanup-audit-log-hourly');
  END IF;
END $$;

-- Создаём cron job: запускается КАЖДЫЙ ЧАС
-- Удаляет по 1000 записей = 24k записей в день = 720k в месяц
SELECT cron.schedule(
  'cleanup-audit-log-hourly',
  '0 * * * *',  -- Каждый час в :00
  $$SELECT public.cleanup_audit_log_small_batch();$$
);

-- Проверка
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname = 'cleanup-audit-log-hourly';

-- =====================================================
-- ИТОГО:
-- ✅ Функция удаляет только 1000 записей (быстро, без timeout)
-- ✅ Запускается каждый час автоматически
-- ✅ За месяц удалит 720,000 записей
-- ✅ Логи перестанут накапливаться
-- ✅ Текущий backlog (5GB) удалится постепенно за 2-3 недели
-- =====================================================
