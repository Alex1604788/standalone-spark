-- =====================================================
-- Migration: Update get_sales_analytics to use ozon_performance_daily
-- Date: 2025-12-20
-- Description: Update SQL function to use new ozon_performance_daily table instead of old promotion_costs
-- =====================================================

-- Drop and recreate the function with updated logic
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
    -- Продажи из начислений ОЗОН (только "Доставка покупателю")
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
    -- Затраты на продвижение из OZON Performance API (новая таблица)
    SELECT
      opd.offer_id,
      SUM(opd.money_spent) as promo_cost
    FROM public.ozon_performance_daily opd
    WHERE opd.marketplace_id = p_marketplace_id
      AND opd.stat_date BETWEEN p_start_date AND p_end_date
      AND opd.offer_id IS NOT NULL
    GROUP BY opd.offer_id
  ),
  storage AS (
    -- Стоимость размещения
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

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION public.get_sales_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_analytics TO service_role;

-- Add comment explaining the update
COMMENT ON FUNCTION public.get_sales_analytics IS 'Updated 2025-12-20: Now uses ozon_performance_daily table for promotion costs instead of old promotion_costs table. Aggregates sales data from ozon_accruals, promotion costs from ozon_performance_daily, and storage costs from storage_costs.';
