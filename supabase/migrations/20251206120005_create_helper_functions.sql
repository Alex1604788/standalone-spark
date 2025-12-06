-- =====================================================
-- Migration: Create helper functions
-- Date: 2025-12-06
-- Description: Вспомогательные функции для работы с данными
-- =====================================================

-- Function: Поиск offer_id по SKU через таблицу products
CREATE OR REPLACE FUNCTION public.find_offer_id_by_sku(
  p_marketplace_id UUID,
  p_sku TEXT
) RETURNS TEXT AS $$
DECLARE
  v_offer_id TEXT;
BEGIN
  -- Ищем в таблице products (из API sync)
  SELECT external_id INTO v_offer_id
  FROM public.products
  WHERE marketplace_id = p_marketplace_id
    AND (
      -- Предполагаем что в products есть поле для SKU
      -- Адаптируйте под вашу структуру таблицы products
      external_id = p_sku OR
      -- Если есть отдельное поле sku:
      -- sku = p_sku OR
      -- Или проверяем JSON метаданные
      (product_metadata::jsonb->>'sku' = p_sku)
    )
  LIMIT 1;

  RETURN v_offer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.find_offer_id_by_sku TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_offer_id_by_sku TO service_role;

-- Trigger function: Автоматическое заполнение offer_id при импорте
CREATE OR REPLACE FUNCTION public.fill_offer_id_from_sku()
RETURNS TRIGGER AS $$
BEGIN
  -- Если offer_id пустой, но есть SKU - ищем offer_id
  IF (NEW.offer_id IS NULL OR NEW.offer_id = '') AND NEW.sku IS NOT NULL THEN
    NEW.offer_id := public.find_offer_id_by_sku(NEW.marketplace_id, NEW.sku);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to promotion_costs (в этой таблице часто только SKU)
CREATE TRIGGER trigger_fill_offer_id_promotion
  BEFORE INSERT OR UPDATE ON public.promotion_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_offer_id_from_sku();

-- Trigger function: Проверка отклонения объема от эталона
CREATE OR REPLACE FUNCTION public.check_volume_deviation()
RETURNS TRIGGER AS $$
DECLARE
  v_standard_volume DECIMAL(10, 3);
  v_tolerance DECIMAL(5, 2);
  v_deviation DECIMAL(10, 3);
BEGIN
  -- Получаем эталонное значение и допуск
  SELECT standard_volume_liters, tolerance_percent
  INTO v_standard_volume, v_tolerance
  FROM public.product_volume_standards
  WHERE marketplace_id = NEW.marketplace_id
    AND offer_id = NEW.offer_id;

  -- Если эталон установлен - проверяем отклонение
  IF v_standard_volume IS NOT NULL AND NEW.volume_liters IS NOT NULL THEN
    v_deviation := ABS(NEW.volume_liters - v_standard_volume) / v_standard_volume * 100;

    IF v_deviation > COALESCE(v_tolerance, 5.0) THEN
      NEW.is_different_from_standard := TRUE;
    ELSE
      NEW.is_different_from_standard := FALSE;
    END IF;
  ELSE
    NEW.is_different_from_standard := FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to product_volume_history
CREATE TRIGGER trigger_check_volume_deviation
  BEFORE INSERT OR UPDATE ON public.product_volume_history
  FOR EACH ROW
  EXECUTE FUNCTION public.check_volume_deviation();

-- Function: Получение данных за период для аналитики
CREATE OR REPLACE FUNCTION public.get_sales_analytics(
  p_marketplace_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  offer_id TEXT,
  total_sales DECIMAL(10, 2),
  total_quantity DECIMAL(10, 3),
  total_promotion_cost DECIMAL(10, 2),
  total_storage_cost DECIMAL(10, 2)
) AS $$
BEGIN
  RETURN QUERY
  WITH sales AS (
    SELECT
      oa.offer_id,
      SUM(oa.total_amount) as sales_amount,
      SUM(oa.quantity) as sales_qty
    FROM public.ozon_accruals oa
    WHERE oa.marketplace_id = p_marketplace_id
      AND oa.accrual_date BETWEEN p_start_date AND p_end_date
      AND oa.accrual_type IN ('Доставка покупателю')  -- Продажи
    GROUP BY oa.offer_id
  ),
  promotion AS (
    SELECT
      pc.offer_id,
      SUM(pc.promotion_cost) as promo_cost
    FROM public.promotion_costs pc
    WHERE pc.marketplace_id = p_marketplace_id
      AND pc.period_start <= p_end_date
      AND pc.period_end >= p_start_date
      AND pc.offer_id IS NOT NULL
    GROUP BY pc.offer_id
  ),
  storage AS (
    SELECT
      sc.offer_id,
      SUM(sc.storage_cost) as stor_cost
    FROM public.storage_costs sc
    WHERE sc.marketplace_id = p_marketplace_id
      AND sc.cost_date BETWEEN p_start_date AND p_end_date
    GROUP BY sc.offer_id
  )
  SELECT
    COALESCE(s.offer_id, p.offer_id, st.offer_id) as offer_id,
    COALESCE(s.sales_amount, 0) as total_sales,
    COALESCE(s.sales_qty, 0) as total_quantity,
    COALESCE(p.promo_cost, 0) as total_promotion_cost,
    COALESCE(st.stor_cost, 0) as total_storage_cost
  FROM sales s
  FULL OUTER JOIN promotion p ON s.offer_id = p.offer_id
  FULL OUTER JOIN storage st ON COALESCE(s.offer_id, p.offer_id) = st.offer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_sales_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_analytics TO service_role;
