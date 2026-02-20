-- ============================================================================
-- МИГРАЦИЯ: Функция для автоматической очистки старых отзывов
-- Дата: 2026-02-20
-- Цель: Освободить место в БД, удалив старые отзывы
-- ============================================================================

-- Создаем функцию для очистки старых отзывов
CREATE OR REPLACE FUNCTION public.cleanup_old_reviews(
  days_threshold INTEGER DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
  deleted_1_star INTEGER := 0;
  deleted_2_star INTEGER := 0;
  deleted_3_star INTEGER := 0;
  deleted_4_star INTEGER := 0;
  deleted_5_star INTEGER := 0;
  cutoff_date TIMESTAMPTZ;
  result jsonb;
BEGIN
  -- Вычисляем дату отсечки
  cutoff_date := NOW() - (days_threshold || ' days')::INTERVAL;

  -- Подсчитываем количество отзывов по рейтингам перед удалением
  SELECT COUNT(*) INTO deleted_1_star FROM reviews WHERE created_at < cutoff_date AND rating = 1;
  SELECT COUNT(*) INTO deleted_2_star FROM reviews WHERE created_at < cutoff_date AND rating = 2;
  SELECT COUNT(*) INTO deleted_3_star FROM reviews WHERE created_at < cutoff_date AND rating = 3;
  SELECT COUNT(*) INTO deleted_4_star FROM reviews WHERE created_at < cutoff_date AND rating = 4;
  SELECT COUNT(*) INTO deleted_5_star FROM reviews WHERE created_at < cutoff_date AND rating = 5;

  deleted_count := deleted_1_star + deleted_2_star + deleted_3_star + deleted_4_star + deleted_5_star;

  -- Удаляем старые отзывы (cascade удалит и связанные replies)
  DELETE FROM reviews
  WHERE created_at < cutoff_date;

  -- Формируем результат
  result := jsonb_build_object(
    'status', 'success',
    'deleted_count', deleted_count,
    'deleted_by_rating', jsonb_build_object(
      '1_star', deleted_1_star,
      '2_star', deleted_2_star,
      '3_star', deleted_3_star,
      '4_star', deleted_4_star,
      '5_star', deleted_5_star
    ),
    'cutoff_date', cutoff_date,
    'days_threshold', days_threshold,
    'executed_at', NOW(),
    'message', CASE
      WHEN deleted_count = 0 THEN 'Нет записей для удаления'
      ELSE 'Успешно удалено ' || deleted_count || ' отзывов старше ' || days_threshold || ' дней'
    END
  );

  RETURN result;
END;
$$;

-- Комментарий к функции
COMMENT ON FUNCTION public.cleanup_old_reviews(INTEGER) IS
'Удаляет отзывы старше указанного количества дней (по умолчанию 180).
Связанные replies удаляются автоматически через CASCADE.';

-- ============================================================================
-- ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ:
--
-- 1. Удалить отзывы старше 180 дней (по умолчанию):
--    SELECT public.cleanup_old_reviews();
--
-- 2. Удалить отзывы старше 90 дней:
--    SELECT public.cleanup_old_reviews(90);
--
-- 3. Удалить отзывы старше 1 года:
--    SELECT public.cleanup_old_reviews(365);
--
-- 4. Проверить количество отзывов для удаления БЕЗ удаления:
--    SELECT COUNT(*) FROM reviews WHERE created_at < NOW() - INTERVAL '180 days';
-- ============================================================================
