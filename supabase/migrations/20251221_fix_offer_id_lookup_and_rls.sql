-- =====================================================
-- Migration: Fix offer_id lookup and RLS policies
-- Date: 2025-12-21
-- Description: Исправление поиска offer_id по SKU и RLS политик
-- =====================================================

-- ====================================================
-- ЧАСТЬ 1: Исправление функции find_offer_id_by_sku()
-- ====================================================

-- Проблема: функция ищет в таблице products, где НЕТ поля sku
-- Решение: искать в ozon_accruals, где ЕСТЬ связка sku → offer_id

CREATE OR REPLACE FUNCTION public.find_offer_id_by_sku(
  p_marketplace_id UUID,
  p_sku TEXT
) RETURNS TEXT AS $$
DECLARE
  v_offer_id TEXT;
BEGIN
  -- Ищем в таблице ozon_accruals (в ней есть связка sku → offer_id)
  SELECT DISTINCT offer_id INTO v_offer_id
  FROM public.ozon_accruals
  WHERE marketplace_id = p_marketplace_id
    AND sku = p_sku
    AND offer_id IS NOT NULL
    AND offer_id != ''
  LIMIT 1;

  -- Если не нашли в ozon_accruals, пробуем в storage_costs
  IF v_offer_id IS NULL THEN
    SELECT DISTINCT offer_id INTO v_offer_id
    FROM public.storage_costs
    WHERE marketplace_id = p_marketplace_id
      AND sku = p_sku
      AND offer_id IS NOT NULL
      AND offer_id != ''
    LIMIT 1;
  END IF;

  RETURN v_offer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================
-- ЧАСТЬ 2: Исправление RLS политик для ozon_performance_daily
-- ====================================================

-- Проблема: Edge Function использует service_role и вставляет данные,
-- но RLS фильтрует их при SELECT от authenticated пользователей
-- Решение: Добавить политику для service_role

-- Удаляем старые политики
DROP POLICY IF EXISTS "Users can view performance data from own marketplaces" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "System can insert performance data" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "System can update performance data" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "System can delete performance data" ON public.ozon_performance_daily;

-- Новая политика SELECT: доступ для authenticated (проверяем marketplace owner) + service_role
CREATE POLICY "Users and service can view performance data"
  ON public.ozon_performance_daily FOR SELECT
  USING (
    -- service_role видит все (для админки и Table Editor)
    current_setting('role') = 'service_role'
    OR
    -- authenticated видит только свои маркетплейсы
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Новая политика INSERT: service_role + authenticated владельцы
CREATE POLICY "Users and service can insert performance data"
  ON public.ozon_performance_daily FOR INSERT
  WITH CHECK (
    -- service_role может вставлять всё (для Edge Functions)
    current_setting('role') = 'service_role'
    OR
    -- authenticated может вставлять только в свои маркетплейсы
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Новая политика UPDATE: service_role + authenticated владельцы
CREATE POLICY "Users and service can update performance data"
  ON public.ozon_performance_daily FOR UPDATE
  USING (
    current_setting('role') = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Новая политика DELETE: service_role + authenticated владельцы
CREATE POLICY "Users and service can delete performance data"
  ON public.ozon_performance_daily FOR DELETE
  USING (
    current_setting('role') = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- ====================================================
-- ЧАСТЬ 3: Заполнение пустых offer_id в существующих данных
-- ====================================================

-- Обновляем существующие записи, где offer_id = NULL
UPDATE public.ozon_performance_daily
SET offer_id = public.find_offer_id_by_sku(marketplace_id, sku)
WHERE offer_id IS NULL
  AND sku IS NOT NULL;

-- ====================================================
-- ЧАСТЬ 4: Проверка результата
-- ====================================================

-- Выводим статистику по обновлению
DO $$
DECLARE
  v_total_records INTEGER;
  v_null_offer_id INTEGER;
  v_filled_offer_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_records FROM public.ozon_performance_daily;
  SELECT COUNT(*) INTO v_null_offer_id FROM public.ozon_performance_daily WHERE offer_id IS NULL;
  SELECT COUNT(*) INTO v_filled_offer_id FROM public.ozon_performance_daily WHERE offer_id IS NOT NULL;

  RAISE NOTICE '=== Статистика ozon_performance_daily ===';
  RAISE NOTICE 'Всего записей: %', v_total_records;
  RAISE NOTICE 'С заполненным offer_id: %', v_filled_offer_id;
  RAISE NOTICE 'С пустым offer_id: %', v_null_offer_id;
  RAISE NOTICE 'Процент заполнения: %', ROUND((v_filled_offer_id::DECIMAL / v_total_records) * 100, 2);
END $$;
