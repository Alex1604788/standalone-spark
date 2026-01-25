-- =========================================================
-- ТЕСТИРОВАНИЕ СИСТЕМЫ ОЧИСТКИ
-- Выполни этот скрипт в Supabase SQL Editor для теста
-- =========================================================

-- Шаг 1: Создаем функцию очистки (если еще не создана)
-- Скопируй и выполни CREATE_CLEANUP_FUNCTION.sql сначала!

-- Шаг 2: Создаем тестовые записи со старыми датами
DO $$
DECLARE
  test_failed_id uuid;
  test_drafted_id uuid;
  test_published_id uuid;
  old_date timestamptz;
BEGIN
  -- Дата 40 дней назад
  old_date := NOW() - INTERVAL '40 days';

  -- Генерируем UUID
  test_failed_id := gen_random_uuid();
  test_drafted_id := gen_random_uuid();
  test_published_id := gen_random_uuid();

  RAISE NOTICE '====================================';
  RAISE NOTICE 'ТЕСТ: Создание тестовых записей';
  RAISE NOTICE '====================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Дата тестовых записей: %', old_date;
  RAISE NOTICE '';

  -- Создаем тестовые записи с принудительной старой датой
  INSERT INTO replies (id, review_id, content, status, mode, created_at)
  VALUES
    (test_failed_id, 'test-review-failed', 'Test failed reply for cleanup', 'failed', 'test', old_date),
    (test_drafted_id, 'test-review-drafted', 'Test drafted reply for cleanup', 'drafted', 'test', old_date),
    (test_published_id, 'test-review-published', 'Test published reply for cleanup', 'published', 'test', old_date);

  RAISE NOTICE 'Создано 3 тестовые записи:';
  RAISE NOTICE '  Failed ID:    %', test_failed_id;
  RAISE NOTICE '  Drafted ID:   %', test_drafted_id;
  RAISE NOTICE '  Published ID: %', test_published_id;
  RAISE NOTICE '';

END $$;

-- Шаг 3: Проверяем что записи созданы
SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest_date
FROM replies
WHERE created_at < NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY count DESC;

-- Шаг 4: Запускаем очистку
SELECT public.cleanup_old_replies();

-- Шаг 5: Проверяем что записи удалены
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM replies WHERE created_at < NOW() - INTERVAL '30 days')
    THEN '❌ ТЕСТ НЕ ПРОЙДЕН: Остались старые записи'
    ELSE '✅ ТЕСТ ПРОЙДЕН: Все старые записи удалены'
  END as test_result;

-- Шаг 6: Показываем оставшиеся записи (если есть)
SELECT
  id,
  status,
  created_at,
  NOW() - created_at as age
FROM replies
WHERE created_at < NOW() - INTERVAL '30 days'
ORDER BY created_at ASC;

-- Если таблица пустая, должно вывести:
-- test_result: ✅ ТЕСТ ПРОЙДЕН: Все старые записи удалены
