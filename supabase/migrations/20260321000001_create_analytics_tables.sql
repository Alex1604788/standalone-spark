-- ============================================================
-- Аналитический блок: ежедневные данные из Ozon API
-- ============================================================

-- Ежедневная аналитика из Ozon API /v1/analytics/data
CREATE TABLE IF NOT EXISTS public.ozon_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  offer_id TEXT NOT NULL,
  date DATE NOT NULL,

  -- Сессии и воронка
  session_view INTEGER DEFAULT 0,
  percent_session_to_pdp NUMERIC(10,4),
  percent_pdp_to_cart NUMERIC(10,4),
  percent_cart_to_order NUMERIC(10,4),
  percent_order_to_buy NUMERIC(10,4),
  percent_pdp_to_order NUMERIC(10,4),

  -- Заказы и выкупы
  ordered_cnt INTEGER DEFAULT 0,
  ordered_amount NUMERIC(15,2) DEFAULT 0,
  bought_cnt INTEGER DEFAULT 0,
  bought_amount NUMERIC(15,2) DEFAULT 0,
  returned_cnt INTEGER DEFAULT 0,
  cancelled_cnt INTEGER DEFAULT 0,

  -- Реклама
  adv_views INTEGER DEFAULT 0,
  adv_clicks INTEGER DEFAULT 0,
  adv_carts INTEGER DEFAULT 0,
  adv_orders INTEGER DEFAULT 0,
  adv_revenue NUMERIC(15,2) DEFAULT 0,
  adv_expenses NUMERIC(15,2) DEFAULT 0,
  adv_cpc NUMERIC(10,4),
  adv_cpm NUMERIC(10,4),
  adv_cpcart NUMERIC(10,4),
  adv_cpo NUMERIC(10,4),
  adv_cpo_general NUMERIC(10,4),
  percent_ctr NUMERIC(10,4),
  percent_drr NUMERIC(10,4),
  percent_adv_drr NUMERIC(10,4),

  -- Цены и рейтинг
  price_seller NUMERIC(15,2),
  price_ozon NUMERIC(15,2),
  price_index NUMERIC(10,4),
  content_rating NUMERIC(10,4),

  -- Финансы (из начислений)
  bought_commission NUMERIC(15,2) DEFAULT 0,
  bought_expense NUMERIC(15,2) DEFAULT 0,
  returned_amount NUMERIC(15,2) DEFAULT 0,
  returned_commission NUMERIC(15,2) DEFAULT 0,
  returned_expense NUMERIC(15,2) DEFAULT 0,
  acquiring NUMERIC(15,2) DEFAULT 0,
  marketplace_expenses NUMERIC(15,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(marketplace_id, offer_id, date)
);

-- Снимки остатков (FBO/FBS по дням)
CREATE TABLE IF NOT EXISTS public.ozon_stocks_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  offer_id TEXT NOT NULL,
  sku TEXT,
  date DATE NOT NULL,
  fbo_stocks INTEGER DEFAULT 0,
  fbs_stocks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, offer_id, date)
);

-- Себестоимость товаров (история)
CREATE TABLE IF NOT EXISTS public.product_cost_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  offer_id TEXT NOT NULL,
  cost_price NUMERIC(15,2) NOT NULL,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, offer_id, valid_from)
);

-- Индексы для быстрых запросов
CREATE INDEX IF NOT EXISTS idx_ozon_analytics_daily_mp_date
  ON public.ozon_analytics_daily(marketplace_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_ozon_analytics_daily_offer_date
  ON public.ozon_analytics_daily(marketplace_id, offer_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_ozon_stocks_daily_mp_date
  ON public.ozon_stocks_daily(marketplace_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_ozon_stocks_daily_offer
  ON public.ozon_stocks_daily(marketplace_id, offer_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_product_cost_prices_offer
  ON public.product_cost_prices(marketplace_id, offer_id, valid_from DESC);

-- RLS (Row Level Security)
ALTER TABLE public.ozon_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ozon_stocks_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own analytics daily"
  ON public.ozon_analytics_daily FOR ALL
  USING (marketplace_id IN (
    SELECT id FROM public.marketplaces WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users see own stocks daily"
  ON public.ozon_stocks_daily FOR ALL
  USING (marketplace_id IN (
    SELECT id FROM public.marketplaces WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users see own cost prices"
  ON public.product_cost_prices FOR ALL
  USING (marketplace_id IN (
    SELECT id FROM public.marketplaces WHERE user_id = auth.uid()
  ));

-- Обновление updated_at автоматически
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ozon_analytics_daily_updated_at
  BEFORE UPDATE ON public.ozon_analytics_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
