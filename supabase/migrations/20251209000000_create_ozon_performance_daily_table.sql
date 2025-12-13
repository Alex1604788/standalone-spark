-- =====================================================
-- Migration: Create ozon_performance_daily table
-- Date: 2025-12-09
-- Description: Полная статистика OZON Performance API с разбивкой по дням
-- =====================================================

-- Drop old promotion_costs table if exists (replaced by this table)
-- DROP TABLE IF EXISTS public.promotion_costs;

-- Create ozon_performance_daily table
CREATE TABLE IF NOT EXISTS public.ozon_performance_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Дата статистики
  stat_date DATE NOT NULL,

  -- Идентификаторы товара
  sku TEXT NOT NULL,              -- SKU в системе OZON
  offer_id TEXT,                  -- Артикул продавца (заполняется триггером или при импорте)

  -- Идентификаторы кампании
  campaign_id TEXT NOT NULL,      -- ID рекламной кампании
  campaign_name TEXT,             -- Название кампании
  campaign_type TEXT,             -- Тип кампании (SEARCH_PROMO, SKU, etc.)

  -- Основные метрики (всегда есть в API)
  money_spent DECIMAL(10, 2) DEFAULT 0,     -- Расходы на рекламу (руб)
  views INTEGER DEFAULT 0,                   -- Показы
  clicks INTEGER DEFAULT 0,                  -- Клики
  orders INTEGER DEFAULT 0,                  -- Заказы

  -- Дополнительные метрики (могут быть в зависимости от типа кампании)
  revenue DECIMAL(10, 2),                    -- Выручка от рекламы
  avg_bill DECIMAL(10, 2),                   -- Средний чек
  add_to_cart INTEGER,                       -- Добавления в корзину
  favorites INTEGER,                         -- Добавления в избранное

  -- Рассчитываемые метрики (вычисляются автоматически)
  ctr DECIMAL(5, 2),                         -- CTR % (clicks / views * 100)
  cpc DECIMAL(10, 2),                        -- CPC (money_spent / clicks)
  conversion DECIMAL(5, 2),                  -- Конверсия % (orders / clicks * 100)
  add_to_cart_conversion DECIMAL(5, 2),      -- Конверсия в корзину % (add_to_cart / clicks * 100)
  drr DECIMAL(5, 2),                         -- ДРР % (money_spent / revenue * 100)

  -- Дополнительные данные (JSON для гибкости)
  additional_data JSONB,                     -- Любые дополнительные поля из API

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, stat_date, sku, campaign_id)
);

-- Enable RLS
ALTER TABLE public.ozon_performance_daily ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_perf_marketplace ON public.ozon_performance_daily(marketplace_id);
CREATE INDEX idx_perf_date ON public.ozon_performance_daily(marketplace_id, stat_date DESC);
CREATE INDEX idx_perf_sku ON public.ozon_performance_daily(marketplace_id, sku);
CREATE INDEX idx_perf_offer ON public.ozon_performance_daily(marketplace_id, offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX idx_perf_campaign ON public.ozon_performance_daily(marketplace_id, campaign_id);
CREATE INDEX idx_perf_date_range ON public.ozon_performance_daily(marketplace_id, stat_date)
  WHERE stat_date >= CURRENT_DATE - INTERVAL '90 days';  -- Для быстрых запросов за последние 3 месяца

-- RLS Policies
CREATE POLICY "Users can view performance data from own marketplaces"
  ON public.ozon_performance_daily FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert performance data"
  ON public.ozon_performance_daily FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update performance data"
  ON public.ozon_performance_daily FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can delete performance data"
  ON public.ozon_performance_daily FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Trigger: Auto-calculate metrics
CREATE OR REPLACE FUNCTION public.calculate_performance_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- CTR % = (clicks / views) * 100
  IF NEW.views > 0 THEN
    NEW.ctr := ROUND((NEW.clicks::DECIMAL / NEW.views) * 100, 2);
  ELSE
    NEW.ctr := 0;
  END IF;

  -- CPC = money_spent / clicks
  IF NEW.clicks > 0 THEN
    NEW.cpc := ROUND(NEW.money_spent / NEW.clicks, 2);
  ELSE
    NEW.cpc := 0;
  END IF;

  -- Conversion % = (orders / clicks) * 100
  IF NEW.clicks > 0 THEN
    NEW.conversion := ROUND((NEW.orders::DECIMAL / NEW.clicks) * 100, 2);
  ELSE
    NEW.conversion := 0;
  END IF;

  -- Add to cart conversion % = (add_to_cart / clicks) * 100
  IF NEW.clicks > 0 AND NEW.add_to_cart IS NOT NULL THEN
    NEW.add_to_cart_conversion := ROUND((NEW.add_to_cart::DECIMAL / NEW.clicks) * 100, 2);
  ELSE
    NEW.add_to_cart_conversion := NULL;
  END IF;

  -- ДРР % = (money_spent / revenue) * 100
  IF NEW.revenue IS NOT NULL AND NEW.revenue > 0 THEN
    NEW.drr := ROUND((NEW.money_spent / NEW.revenue) * 100, 2);
  ELSE
    NEW.drr := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_performance_metrics
  BEFORE INSERT OR UPDATE ON public.ozon_performance_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_performance_metrics();

-- Trigger: Auto-fill offer_id from SKU
CREATE TRIGGER trigger_fill_offer_id_performance
  BEFORE INSERT OR UPDATE ON public.ozon_performance_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_offer_id_from_sku();

-- Create view for aggregated promotion costs (for backward compatibility)
CREATE OR REPLACE VIEW public.promotion_costs_aggregated AS
SELECT
  marketplace_id,
  stat_date as cost_date,
  offer_id,
  sku,
  SUM(money_spent) as promotion_cost,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders) as total_orders,
  SUM(revenue) as total_revenue,
  AVG(ctr) as avg_ctr,
  AVG(cpc) as avg_cpc,
  AVG(conversion) as avg_conversion,
  AVG(drr) as avg_drr,
  MIN(imported_at) as first_imported_at,
  MAX(imported_at) as last_imported_at
FROM public.ozon_performance_daily
GROUP BY marketplace_id, stat_date, offer_id, sku;

-- Grant access to view
GRANT SELECT ON public.promotion_costs_aggregated TO authenticated;
