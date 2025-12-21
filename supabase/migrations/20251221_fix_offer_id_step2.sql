-- ====================================================
-- Шаг 2: Создание функции, политик и обновление данных
-- ====================================================

-- ЧАСТЬ 1: Функция поиска offer_id
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

-- ЧАСТЬ 2: Новые RLS политики
CREATE POLICY "Users and service can view performance data"
  ON public.ozon_performance_daily FOR SELECT
  USING (
    current_setting('role') = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users and service can insert performance data"
  ON public.ozon_performance_daily FOR INSERT
  WITH CHECK (
    current_setting('role') = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

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

-- ЧАСТЬ 3: Обновление offer_id
UPDATE public.ozon_performance_daily
SET offer_id = public.find_offer_id_by_sku(marketplace_id, sku)
WHERE offer_id IS NULL
  AND sku IS NOT NULL;

-- ЧАСТЬ 4: Статистика
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
  IF v_total_records > 0 THEN
    RAISE NOTICE 'Процент заполнения: %', ROUND((v_filled_offer_id::DECIMAL / v_total_records) * 100, 2);
  END IF;
END $$;
