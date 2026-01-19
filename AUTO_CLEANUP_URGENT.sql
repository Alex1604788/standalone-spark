-- =====================================================
-- АГРЕССИВНАЯ СРОЧНАЯ ОЧИСТКА - УДАЛИТ ВСЁ ЗА 2 ЧАСА
-- =====================================================
-- Создаёт cron job который запускается КАЖДУЮ МИНУТУ
-- Работает 50 секунд и удаляет ~25,000-50,000 записей
-- ~3-6 миллионов записей за 2 часа
-- База очистится автоматически за 2-4 часа
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Функция: работает 50 секунд, удаляет максимум записей
CREATE OR REPLACE FUNCTION public.cleanup_audit_log_urgent()
RETURNS TABLE (deleted_count BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted_total BIGINT := 0;
  v_deleted INT;
  v_start_time TIMESTAMP;
  v_batch_num INT := 0;
BEGIN
  v_start_time := clock_timestamp();

  -- Работаем максимум 50 секунд (оставляем 10 сек запас до timeout)
  LOOP
    -- Удаляем 500 записей
    DELETE FROM public.audit_log
    WHERE id IN (
      SELECT id
      FROM public.audit_log
      WHERE created_at < NOW() - INTERVAL '7 days'
      ORDER BY created_at ASC
      LIMIT 500
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    EXIT WHEN v_deleted = 0;

    v_deleted_total := v_deleted_total + v_deleted;
    v_batch_num := v_batch_num + 1;

    -- Выходим если прошло больше 50 секунд
    EXIT WHEN EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) > 50;

    -- Пауза 0.5 секунды
    PERFORM pg_sleep(0.5);
  END LOOP;

  deleted_count := v_deleted_total;
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
-- ✅ Запускается каждую минуту
-- ✅ Работает 50 секунд, удаляет ~50-100 батчей по 500 записей
-- ✅ ~25,000-50,000 записей в минуту
-- ✅ ~1.5-3 МИЛЛИОНА записей в час
-- ✅ ~3-6 МИЛЛИОНОВ записей за 2 часа
-- ✅ База должна очиститься за 2-4 часа
--
-- ПРОВЕРИТЬ ЧТО РАБОТАЕТ (через минуту):
-- SELECT * FROM cron.job_run_details
-- WHERE jobname = 'cleanup-audit-log-urgent'
-- ORDER BY start_time DESC LIMIT 5;
--
-- КОГДА БАЗА ОЧИСТИТСЯ:
-- SELECT cron.unschedule('cleanup-audit-log-urgent');
-- =====================================================
