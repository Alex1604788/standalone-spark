-- ============================================================
-- Блок «Закупка и распределение»
-- ============================================================

-- Кластера Ozon (16 рабочих)
CREATE TABLE IF NOT EXISTS public.clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, short_name)
);

-- Категории селлера (с коэффициентами)
CREATE TABLE IF NOT EXISTS public.seller_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  coverage_coef NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  distribution_coef NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  description TEXT,
  is_novelty BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, code)
);

-- Географическое распределение категорий Ozon по кластерам
CREATE TABLE IF NOT EXISTS public.ozon_category_cluster_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  description_category_id BIGINT NOT NULL,
  ozon_category_name TEXT,
  cluster_id UUID REFERENCES public.clusters(id) ON DELETE CASCADE NOT NULL,
  distribution_share NUMERIC(10,6) NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, description_category_id, cluster_id)
);

-- Бизнес-данные товара (упаковка, поставщик, срок доставки, категория)
-- Дополняем существующую таблицу product_business_data если она есть,
-- иначе создаём новую
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_business_data'
  ) THEN
    CREATE TABLE public.product_business_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
      offer_id TEXT NOT NULL,
      seller_category_code TEXT,
      lead_time_days INTEGER DEFAULT 14,
      small_box_quantity INTEGER,
      large_box_quantity INTEGER,
      central_stock INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(marketplace_id, offer_id)
    );
  ELSE
    -- Добавляем колонки если их нет
    ALTER TABLE public.product_business_data
      ADD COLUMN IF NOT EXISTS seller_category_code TEXT,
      ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 14,
      ADD COLUMN IF NOT EXISTS small_box_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS large_box_quantity INTEGER,
      ADD COLUMN IF NOT EXISTS central_stock INTEGER DEFAULT 0;
  END IF;
END $$;

-- Поставщики
CREATE TABLE IF NOT EXISTS public.procurement_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  lead_time_days INTEGER DEFAULT 14,
  contact TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Планы продаж
CREATE TABLE IF NOT EXISTS public.sales_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  offer_id TEXT NOT NULL,
  plan_month DATE NOT NULL,
  plan_qty INTEGER NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, offer_id, plan_month)
);

-- Ручной товар в пути
CREATE TABLE IF NOT EXISTS public.manual_in_transit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  offer_id TEXT NOT NULL,
  cluster_id UUID REFERENCES public.clusters(id),
  qty INTEGER NOT NULL,
  ship_date DATE,
  status TEXT DEFAULT 'open',
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT manual_in_transit_status_check
    CHECK (status IN ('open', 'suspected_matched', 'closed'))
);

-- Сессии распределения (рабочая дата)
CREATE TABLE IF NOT EXISTS public.allocation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  working_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT allocation_sessions_status_check
    CHECK (status IN ('draft', 'active', 'closed'))
);

-- Версии распределения (BASE / ADDON)
CREATE TABLE IF NOT EXISTS public.allocation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.allocation_sessions(id) ON DELETE CASCADE NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  version_type TEXT DEFAULT 'BASE',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT allocation_versions_type_check
    CHECK (version_type IN ('BASE', 'ADDON')),
  CONSTRAINT allocation_versions_status_check
    CHECK (status IN ('draft', 'confirmed', 'closed'))
);

-- Заказы на кластер
CREATE TABLE IF NOT EXISTS public.shipment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES public.allocation_versions(id) ON DELETE CASCADE NOT NULL,
  cluster_id UUID REFERENCES public.clusters(id) NOT NULL,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT shipment_orders_status_check
    CHECK (status IN ('draft', 'confirmed', 'shipped'))
);

-- Строки заказа (товары в заказе на кластер)
CREATE TABLE IF NOT EXISTS public.shipment_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.shipment_orders(id) ON DELETE CASCADE NOT NULL,
  offer_id TEXT NOT NULL,
  cluster_norm NUMERIC(10,2),
  cluster_need NUMERIC(10,2),
  qty_to_ship INTEGER NOT NULL DEFAULT 0,
  manual_override INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Составы комплектов (BOM)
CREATE TABLE IF NOT EXISTS public.product_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  parent_offer_id TEXT NOT NULL,
  component_offer_id TEXT NOT NULL,
  component_qty INTEGER NOT NULL DEFAULT 1,
  UNIQUE(marketplace_id, parent_offer_id, component_offer_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_clusters_mp ON public.clusters(marketplace_id);
CREATE INDEX IF NOT EXISTS idx_sales_plan_mp_month ON public.sales_plan(marketplace_id, plan_month DESC);
CREATE INDEX IF NOT EXISTS idx_sales_plan_offer ON public.sales_plan(marketplace_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_manual_in_transit_offer ON public.manual_in_transit(marketplace_id, offer_id, status);
CREATE INDEX IF NOT EXISTS idx_allocation_sessions_mp ON public.allocation_sessions(marketplace_id, working_date DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_order_items_order ON public.shipment_order_items(order_id);

-- RLS
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ozon_category_cluster_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_in_transit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bom ENABLE ROW LEVEL SECURITY;

-- Политики (через marketplace_id → user_id)
CREATE POLICY "Users own clusters" ON public.clusters FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));

CREATE POLICY "Users own seller_categories" ON public.seller_categories FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));

CREATE POLICY "Users own category_distribution" ON public.ozon_category_cluster_distribution FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));

CREATE POLICY "Users own procurement_suppliers" ON public.procurement_suppliers FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));

CREATE POLICY "Users own sales_plan" ON public.sales_plan FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));

CREATE POLICY "Users own manual_in_transit" ON public.manual_in_transit FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));

CREATE POLICY "Users own allocation_sessions" ON public.allocation_sessions FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));

CREATE POLICY "Users own allocation_versions" ON public.allocation_versions FOR ALL
  USING (session_id IN (
    SELECT id FROM public.allocation_sessions
    WHERE marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid())
  ));

CREATE POLICY "Users own shipment_orders" ON public.shipment_orders FOR ALL
  USING (version_id IN (
    SELECT av.id FROM public.allocation_versions av
    JOIN public.allocation_sessions als ON als.id = av.session_id
    WHERE als.marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid())
  ));

CREATE POLICY "Users own shipment_order_items" ON public.shipment_order_items FOR ALL
  USING (order_id IN (
    SELECT so.id FROM public.shipment_orders so
    JOIN public.allocation_versions av ON av.id = so.version_id
    JOIN public.allocation_sessions als ON als.id = av.session_id
    WHERE als.marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid())
  ));

CREATE POLICY "Users own product_bom" ON public.product_bom FOR ALL
  USING (marketplace_id IN (SELECT id FROM public.marketplaces WHERE user_id = auth.uid()));
