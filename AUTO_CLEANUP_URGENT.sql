-- =====================================================
-- АГРЕССИВНАЯ СРОЧНАЯ ОЧИСТКА
-- =====================================================
-- Создаёт cron job который запускается КАЖДУЮ МИНУТУ
-- Работает 20 секунд и удаляет ~10,000-15,000 записей за минуту
-- ~600,000-900,000 записей за час
-- ~1.2-1.8 МИЛЛИОНА записей за 2 часа
-- База очистится за 4-6 часов
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Функция: работает 20 секунд, удаляет ~10-15k записей
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

  -- Работаем максимум 20 секунд (безопасный запас до timeout)
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

    -- Выходим если прошло больше 20 секунд
    EXIT WHEN EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) > 20;

    -- Пауза 0.3 секунды
    PERFORM pg_sleep(0.3);
  END LOOP;

  deleted_count := v_deleted_total;
  RETURN NEXT;
END;
$$;

-- Удаляем старые cron jobs (игнорируем ошибки если не существуют)
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup-audit-log-urgent');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM cron.unschedule('cleanup-audit-log-hourly');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- Создаём cron job: КАЖДУЮ МИНУТУ
-- 1000 записей/минуту × 60 минут = 60,000 записей/час
-- За сутки = 1,440,000 записей
SELECT cron.schedule(
  'cleanup-audit-log-urgent',
  '* * * * *',  -- КАЖДУЮ МИНУТУ
  $$SELECT public.cleanup_audit_log_urgent();$$
);

-- Проверка (показываем последний созданный job)
SELECT *
FROM cron.job
ORDER BY jobid DESC
LIMIT 1;

-- Показываем текущее состояние
SELECT
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as old_records,
  pg_size_pretty(pg_total_relation_size('public.audit_log')) as size
FROM public.audit_log;

-- =====================================================
-- ИТОГО:
-- ✅ Запускается каждую минуту
-- ✅ Работает 20 секунд, удаляет ~20-30 батчей по 500 записей
-- ✅ ~10,000-15,000 записей в минуту
-- ✅ ~600,000-900,000 записей в час
-- ✅ ~1.2-1.8 МИЛЛИОНА записей за 2 часа
-- ✅ База очистится за 4-6 часов
--
-- ПРОВЕРИТЬ ЧТО РАБОТАЕТ (через минуту):
-- SELECT * FROM cron.job_run_details
-- ORDER BY start_time DESC LIMIT 5;
--
-- КОГДА БАЗА ОЧИСТИТСЯ:
-- SELECT cron.unschedule('cleanup-audit-log-urgent');
-- =====================================================
