-- =========================================================
-- ФУНКЦИЯ ДЛЯ АВТОМАТИЧЕСКОЙ ОЧИСТКИ ТАБЛИЦЫ REPLIES
-- Агрессивная стратегия: удаляем ВСЕ записи старше 30 дней
-- =========================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_replies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer := 0;
  deleted_failed integer := 0;
  deleted_drafted integer := 0;
  deleted_published integer := 0;
  cutoff_date timestamptz;
  result jsonb;
BEGIN
  -- Дата отсечки: 30 дней назад
  cutoff_date := NOW() - INTERVAL '30 days';

  -- Считаем что будем удалять
  SELECT COUNT(*) INTO deleted_failed
  FROM replies
  WHERE status = 'failed' AND created_at < cutoff_date;

  SELECT COUNT(*) INTO deleted_drafted
  FROM replies
  WHERE status = 'drafted' AND created_at < cutoff_date;

  SELECT COUNT(*) INTO deleted_published
  FROM replies
  WHERE status = 'published' AND created_at < cutoff_date;

  -- Общее количество для удаления
  deleted_count := deleted_failed + deleted_drafted + deleted_published;

  -- Если нечего удалять, возвращаем результат
  IF deleted_count = 0 THEN
    result := jsonb_build_object(
      'status', 'success',
      'deleted_count', 0,
      'deleted_failed', 0,
      'deleted_drafted', 0,
      'deleted_published', 0,
      'cutoff_date', cutoff_date,
      'executed_at', NOW(),
      'message', 'Нет записей для удаления'
    );
    RETURN result;
  END IF;

  -- УДАЛЯЕМ СТАРЫЕ ЗАПИСИ
  DELETE FROM replies
  WHERE created_at < cutoff_date;

  -- Выполняем ANALYZE для обновления статистики
  EXECUTE 'ANALYZE replies';

  -- Формируем результат
  result := jsonb_build_object(
    'status', 'success',
    'deleted_count', deleted_count,
    'deleted_failed', deleted_failed,
    'deleted_drafted', deleted_drafted,
    'deleted_published', deleted_published,
    'cutoff_date', cutoff_date,
    'executed_at', NOW(),
    'message', format('Успешно удалено %s записей', deleted_count)
  );

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- В случае ошибки возвращаем информацию об ошибке
    result := jsonb_build_object(
      'status', 'error',
      'error_message', SQLERRM,
      'error_detail', SQLSTATE,
      'executed_at', NOW()
    );
    RETURN result;
END;
$$;

-- Даем права на выполнение
GRANT EXECUTE ON FUNCTION public.cleanup_old_replies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_replies() TO service_role;

COMMENT ON FUNCTION public.cleanup_old_replies() IS
'Удаляет все записи из таблицы replies старше 30 дней (агрессивная очистка).
Возвращает JSON с результатами: количество удаленных записей по статусам.';

-- =========================================================
-- НАСТРОЙКА АВТОМАТИЧЕСКОЙ ОЧИСТКИ ЧЕРЕЗ pg_cron
-- =========================================================

-- Включаем расширение pg_cron (если еще не включено)
-- ВАЖНО: Это должно выполняться от имени postgres или суперпользователя
-- В Supabase это может потребовать обращения в поддержку

-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Настраиваем запуск очистки каждый день в 02:00 UTC
-- SELECT cron.schedule(
--     'cleanup-old-replies-daily',           -- Имя задачи
--     '0 2 * * *',                            -- Каждый день в 02:00 UTC
--     $$ SELECT public.cleanup_old_replies(); $$
-- );

-- Чтобы посмотреть все задачи:
-- SELECT * FROM cron.job;

-- Чтобы посмотреть историю выполнения:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Чтобы удалить задачу:
-- SELECT cron.unschedule('cleanup-old-replies-daily');
