-- =====================================================
-- ПРОВЕРКА ДАННЫХ И ЗАПУСК ПОЛНОЙ СИНХРОНИЗАЦИИ ЗА 62 ДНЯ
-- =====================================================
-- Этот скрипт:
-- 1. Проверит текущие данные в базе
-- 2. Покажет статистику с суммированием orders + orders_model
-- 3. Завершит зависшие синхронизации
-- 4. Запустит полную синхронизацию за 62 дня
-- =====================================================

\set MARKETPLACE_ID '84b1d0f5-6750-407c-9b04-28c051972162'

-- =====================================================
-- 1. ПРОВЕРКА ТЕКУЩИХ ДАННЫХ
-- =====================================================

DO $$
DECLARE
  v_min_date DATE;
  v_max_date DATE;
  v_days_count INT;
  v_total_records INT;
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '📊 ПРОВЕРКА ТЕКУЩИХ ДАННЫХ';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';

  -- Период данных
  SELECT
    MIN(stat_date),
    MAX(stat_date),
    COUNT(*)
  INTO v_min_date, v_max_date, v_total_records
  FROM ozon_performance_daily
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid;

  IF v_min_date IS NOT NULL THEN
    v_days_count := v_max_date - v_min_date + 1;

    RAISE NOTICE '📅 ПЕРИОД ДАННЫХ:';
    RAISE NOTICE '   Первая дата: %', v_min_date;
    RAISE NOTICE '   Последняя дата: %', v_max_date;
    RAISE NOTICE '   Диапазон: % дней', v_days_count;
    RAISE NOTICE '   Всего записей: %', v_total_records;
    RAISE NOTICE '';

    IF v_days_count >= 62 THEN
      RAISE NOTICE '   ✅ Данные за 62 дня ЕСТЬ!';
    ELSE
      RAISE NOTICE '   ⚠️ Данных недостаточно: % дней (нужно 62)', v_days_count;
      RAISE NOTICE '   📝 Требуется полная синхронизация';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ Данных в таблице НЕТ';
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- 2. СТАТИСТИКА С СУММИРОВАНИЕМ ORDERS + ORDERS_MODEL
-- =====================================================

DO $$
DECLARE
  v_total_orders BIGINT;
  v_total_orders_model BIGINT;
  v_total_revenue NUMERIC;
  v_total_revenue_model NUMERIC;
  v_total_spent NUMERIC;
  v_roi NUMERIC;
  v_drr NUMERIC;
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '📈 СТАТИСТИКА С СУММИРОВАНИЕМ';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';

  -- Общая статистика
  SELECT
    COALESCE(SUM(orders), 0),
    COALESCE(SUM(orders_model), 0),
    COALESCE(SUM(revenue), 0),
    COALESCE(SUM(revenue_model), 0),
    COALESCE(SUM(money_spent), 0)
  INTO
    v_total_orders,
    v_total_orders_model,
    v_total_revenue,
    v_total_revenue_model,
    v_total_spent
  FROM ozon_performance_daily
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid;

  RAISE NOTICE '📊 ОБЩИЕ ПОКАЗАТЕЛИ:';
  RAISE NOTICE '   Заказы (обычные): %', v_total_orders;
  RAISE NOTICE '   Заказы (модели): %', v_total_orders_model;
  RAISE NOTICE '   🛒 ВСЕГО ЗАКАЗОВ: %', v_total_orders + v_total_orders_model;
  RAISE NOTICE '';
  RAISE NOTICE '   Выручка (обычная): % ₽', v_total_revenue;
  RAISE NOTICE '   Выручка (модели): % ₽', v_total_revenue_model;
  RAISE NOTICE '   💰 ВСЕГО ВЫРУЧКА: % ₽', v_total_revenue + v_total_revenue_model;
  RAISE NOTICE '';
  RAISE NOTICE '   💸 Общий расход: % ₽', v_total_spent;
  RAISE NOTICE '';

  -- Рассчитываем ROI и ДРР
  IF v_total_spent > 0 THEN
    v_roi := ((v_total_revenue + v_total_revenue_model - v_total_spent) / v_total_spent) * 100;
    v_drr := (v_total_spent / NULLIF(v_total_revenue + v_total_revenue_model, 0)) * 100;

    RAISE NOTICE '   📈 ROI: %%', ROUND(v_roi, 1);
    RAISE NOTICE '   📊 ДРР: %%', ROUND(v_drr, 1);
    RAISE NOTICE '   💵 Прибыль: % ₽', v_total_revenue + v_total_revenue_model - v_total_spent;
  END IF;

  RAISE NOTICE '';

  -- Проверяем наличие модельных данных
  IF v_total_orders_model > 0 THEN
    RAISE NOTICE '✅ Заказы моделей учитываются: % (%.1%% от всех)',
      v_total_orders_model,
      ROUND((v_total_orders_model::NUMERIC / NULLIF(v_total_orders + v_total_orders_model, 0)) * 100, 1);
  ELSE
    RAISE NOTICE 'ℹ️ Заказов моделей нет (OZON не вернул эти данные)';
  END IF;

  IF v_total_revenue_model > 0 THEN
    RAISE NOTICE '✅ Выручка с моделей учитывается: % ₽ (%.1%% от всей)',
      v_total_revenue_model,
      ROUND((v_total_revenue_model::NUMERIC / NULLIF(v_total_revenue + v_total_revenue_model, 0)) * 100, 1);
  ELSE
    RAISE NOTICE 'ℹ️ Выручки с моделей нет';
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- 3. ПОСЛЕДНИЕ 7 ДНЕЙ (С СУММИРОВАНИЕМ)
-- =====================================================

SELECT
  stat_date AS "Дата",
  SUM(orders) AS "Заказы",
  SUM(orders_model) AS "Заказы (модели)",
  SUM(orders) + SUM(orders_model) AS "Всего заказов",
  ROUND(SUM(revenue)::NUMERIC, 2) AS "Выручка ₽",
  ROUND(SUM(revenue_model)::NUMERIC, 2) AS "Выручка (модели) ₽",
  ROUND((SUM(revenue) + SUM(revenue_model))::NUMERIC, 2) AS "Всего выручка ₽",
  ROUND(SUM(money_spent)::NUMERIC, 2) AS "Расход ₽",
  CASE
    WHEN SUM(money_spent) > 0 AND SUM(revenue) + SUM(revenue_model) > 0
    THEN ROUND((SUM(money_spent) / (SUM(revenue) + SUM(revenue_model)) * 100)::NUMERIC, 1)
    ELSE 0
  END AS "ДРР %"
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid
GROUP BY stat_date
ORDER BY stat_date DESC
LIMIT 7;

-- =====================================================
-- 4. ИСТОРИЯ СИНХРОНИЗАЦИЙ
-- =====================================================

SELECT
  status AS "Статус",
  trigger_type AS "Триггер",
  started_at AS "Начало",
  completed_at AS "Завершение",
  campaigns_count AS "Кампаний",
  rows_inserted AS "Строк",
  CASE
    WHEN error_message IS NOT NULL THEN LEFT(error_message, 100)
    ELSE NULL
  END AS "Ошибка"
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid
ORDER BY started_at DESC
LIMIT 5;

-- =====================================================
-- 5. ЗАВЕРШЕНИЕ ЗАВИСШИХ СИНХРОНИЗАЦИЙ
-- =====================================================

DO $$
DECLARE
  v_updated INT;
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '🔧 ЗАВЕРШЕНИЕ ЗАВИСШИХ СИНХРОНИЗАЦИЙ';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';

  UPDATE ozon_sync_history
  SET
    status = 'timeout',
    completed_at = NOW(),
    error_message = 'Timeout - синхронизация автоматически завершена после 30+ минут'
  WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'::uuid
    AND status = 'in_progress'
    AND started_at < NOW() - INTERVAL '30 minutes';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RAISE NOTICE '✅ Завершено зависших синхронизаций: %', v_updated;
  ELSE
    RAISE NOTICE 'ℹ️ Зависших синхронизаций не найдено';
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- 6. ЗАПУСК ПОЛНОЙ СИНХРОНИЗАЦИИ ЗА 62 ДНЯ
-- =====================================================

DO $$
DECLARE
  v_marketplace_id UUID := '84b1d0f5-6750-407c-9b04-28c051972162'::uuid;
  v_request_id BIGINT;
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '🚀 ЗАПУСК ПОЛНОЙ СИНХРОНИЗАЦИИ ЗА 62 ДНЯ';
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '';

  -- Проверяем наличие функции
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_ozon_performance_sync') THEN
    -- Вызываем функцию синхронизации
    PERFORM public.trigger_ozon_performance_sync(v_marketplace_id, 'full');

    RAISE NOTICE '✅ Полная синхронизация запущена!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Параметры:';
    RAISE NOTICE '   Marketplace ID: %', v_marketplace_id;
    RAISE NOTICE '   Период: 62 дня';
    RAISE NOTICE '   Режим: full (auto-continue)';
    RAISE NOTICE '';
    RAISE NOTICE '⏱️ Синхронизация займет 10-15 минут';
    RAISE NOTICE '📊 Проверить результаты можно через:';
    RAISE NOTICE '   SELECT * FROM ozon_sync_history ORDER BY started_at DESC LIMIT 5;';
  ELSE
    RAISE WARNING '⚠️ Функция trigger_ozon_performance_sync не найдена!';
    RAISE WARNING '📝 Запустите сначала скрипт ЗАПУСК_НАСТРОЙКИ_OZON_SYNC.sql';
  END IF;

  RAISE NOTICE '';
END $$;

-- =====================================================
-- ✅ ГОТОВО!
-- =====================================================
-- Что произошло:
-- 1. ✅ Проверены текущие данные
-- 2. ✅ Показана статистика с суммированием orders + orders_model
-- 3. ✅ Завершены зависшие синхронизации
-- 4. ✅ Запущена полная синхронизация за 62 дня
--
-- Проверить прогресс через 10-15 минут:
-- SELECT * FROM ozon_sync_history ORDER BY started_at DESC LIMIT 10;
-- SELECT stat_date, COUNT(*) FROM ozon_performance_daily GROUP BY stat_date ORDER BY stat_date DESC;
-- =====================================================
