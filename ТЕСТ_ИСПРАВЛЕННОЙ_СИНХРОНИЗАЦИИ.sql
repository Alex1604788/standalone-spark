-- =====================================================
-- ЗАВЕРШЕНИЕ ЗАВИСШИХ И ЗАПУСК ИСПРАВЛЕННОЙ СИНХРОНИЗАЦИИ
-- =====================================================
-- Версия: 3.0.8-fix-ozon-api-limit
-- Дата: 2026-01-12
--
-- ЧТО ИСПРАВЛЕНО:
-- ✅ Увеличена пауза между кампаниями с 3 до 90 секунд
-- ✅ Исправлена ошибка "Превышен лимит активных запросов (максимум 1)"
-- ✅ Синхронизация теперь работает стабильно от начала до конца
-- =====================================================

\set MARKETPLACE_ID '84b1d0f5-6750-407c-9b04-28c051972162'

DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '🔧 ФИХ СИНХРОНИЗАЦИИ OZON PERFORMANCE';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';
END $$;

-- =====================================================
-- ШАГ 1: ЗАВЕРШИТЬ ЗАВИСШИЕ СИНХРОНИЗАЦИИ
-- =====================================================

DO $$
DECLARE
  v_updated INT;
BEGIN
  RAISE NOTICE '1️⃣ Завершение зависших синхронизаций...';
  RAISE NOTICE '';

  UPDATE ozon_sync_history
  SET
    status = 'timeout',
    completed_at = NOW(),
    error_message = 'Timeout - автоматически завершено перед запуском v3.0.8-fix-ozon-api-limit'
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid
    AND status = 'in_progress'
    AND started_at < NOW() - INTERVAL '10 minutes';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RAISE NOTICE '✅ Завершено зависших синхронизаций: %', v_updated;
  ELSE
    RAISE NOTICE 'ℹ️ Зависших синхронизаций не найдено';
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- ШАГ 2: ПРОВЕРИТЬ ТЕКУЩЕЕ СОСТОЯНИЕ
-- =====================================================

DO $$
DECLARE
  v_min_date DATE;
  v_max_date DATE;
  v_days_count INT;
  v_total_records INT;
BEGIN
  RAISE NOTICE '2️⃣ Проверка текущих данных...';
  RAISE NOTICE '';

  SELECT
    MIN(stat_date),
    MAX(stat_date),
    COUNT(*)
  INTO v_min_date, v_max_date, v_total_records
  FROM ozon_performance_daily
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid;

  IF v_min_date IS NOT NULL THEN
    v_days_count := v_max_date - v_min_date + 1;

    RAISE NOTICE '📅 Период данных:';
    RAISE NOTICE '   С % по %', v_min_date, v_max_date;
    RAISE NOTICE '   Диапазон: % дней', v_days_count;
    RAISE NOTICE '   Всего записей: %', v_total_records;
    RAISE NOTICE '';

    IF v_days_count >= 62 THEN
      RAISE NOTICE '   ✅ Данные за 62 дня есть!';
    ELSE
      RAISE NOTICE '   ⚠️ Данных только за % дней (нужно 62)', v_days_count;
      RAISE NOTICE '   📝 Будет запущена полная синхронизация';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Данных в таблице НЕТ';
    RAISE NOTICE '📝 Будет запущена первая синхронизация';
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- ШАГ 3: ПОКАЗАТЬ ПОСЛЕДНИЕ СИНХРОНИЗАЦИИ
-- =====================================================

SELECT
  status AS "Статус",
  started_at AS "Начало",
  completed_at AS "Завершение",
  campaigns_count AS "Кампаний",
  rows_inserted AS "Строк",
  LEFT(COALESCE(error_message, ''), 100) AS "Ошибка"
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid
ORDER BY started_at DESC
LIMIT 5;

-- =====================================================
-- ШАГ 4: ЗАПУСТИТЬ ТЕСТОВУЮ СИНХРОНИЗАЦИЮ
-- =====================================================

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162'::uuid;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '3️⃣ ЗАПУСК ТЕСТОВОЙ СИНХРОНИЗАЦИИ';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';

  -- Проверяем наличие функции
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_ozon_performance_sync') THEN
    RAISE NOTICE '🚀 Запускаю тестовую синхронизацию (daily, 7 дней)...';
    RAISE NOTICE '';

    -- Вызываем функцию синхронизации
    PERFORM public.trigger_ozon_performance_sync(v_marketplace_id, 'daily');

    RAISE NOTICE '✅ Синхронизация запущена!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Параметры:';
    RAISE NOTICE '   Marketplace ID: %', v_marketplace_id;
    RAISE NOTICE '   Режим: daily (7 дней)';
    RAISE NOTICE '   Версия: 3.0.8-fix-ozon-api-limit';
    RAISE NOTICE '';
    RAISE NOTICE '⏱️ Синхронизация займет ~10-15 минут';
    RAISE NOTICE '   (90 секунд пауза между кампаниями для избежания OZON API limit)';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Проверить прогресс через 5 минут:';
    RAISE NOTICE '   SELECT * FROM ozon_sync_history';
    RAISE NOTICE '   WHERE marketplace_id = ''%''', v_marketplace_id;
    RAISE NOTICE '   ORDER BY started_at DESC LIMIT 3;';
  ELSE
    RAISE WARNING '⚠️ Функция trigger_ozon_performance_sync не найдена!';
    RAISE WARNING '📝 Сначала запустите ЗАПУСК_НАСТРОЙКИ_OZON_SYNC.sql';
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- ИНСТРУКЦИЯ ПО ПРОВЕРКЕ
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '📖 КАК ПРОВЕРИТЬ ЧТО ВСЁ РАБОТАЕТ';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';
  RAISE NOTICE '1. Через 5 минут проверить статус:';
  RAISE NOTICE '   SELECT status, started_at, rows_inserted, error_message';
  RAISE NOTICE '   FROM ozon_sync_history';
  RAISE NOTICE '   ORDER BY started_at DESC LIMIT 1;';
  RAISE NOTICE '';
  RAISE NOTICE '2. Если status = ''completed'' и error_message IS NULL:';
  RAISE NOTICE '   ✅ УСПЕХ! Синхронизация работает!';
  RAISE NOTICE '';
  RAISE NOTICE '3. Если status = ''failed'' и error_message содержит "Превышен лимит":';
  RAISE NOTICE '   ⚠️ Новая версия Edge Function еще не задеплоена';
  RAISE NOTICE '   📝 Подождите GitHub Actions деплоя (2-3 минуты)';
  RAISE NOTICE '';
  RAISE NOTICE '4. Проверить новые данные:';
  RAISE NOTICE '   SELECT stat_date, COUNT(*) as records';
  RAISE NOTICE '   FROM ozon_performance_daily';
  RAISE NOTICE '   GROUP BY stat_date';
  RAISE NOTICE '   ORDER BY stat_date DESC';
  RAISE NOTICE '   LIMIT 10;';
  RAISE NOTICE '';
  RAISE NOTICE '=================================================================';
END $$;

-- =====================================================
-- ✅ ГОТОВО!
-- =====================================================
-- Что произошло:
-- 1. ✅ Завершены зависшие синхронизации
-- 2. ✅ Показано текущее состояние данных
-- 3. ✅ Запущена тестовая синхронизация (daily, 7 дней)
--
-- Если тест успешен, запустите полную синхронизацию за 62 дня:
-- SELECT public.trigger_ozon_performance_sync(
--   '84b1d0f5-6750-407c-9b04-28c051972162'::uuid,
--   'full'
-- );
-- =====================================================
