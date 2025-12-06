-- =====================================================
-- Migration: Create volume tracking tables
-- Date: 2025-12-06
-- Description: Таблицы для отслеживания объемных характеристик товаров (литраж)
-- =====================================================

-- Create product_volume_standards table (эталонные значения)
CREATE TABLE IF NOT EXISTS public.product_volume_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  offer_id TEXT NOT NULL,

  -- Эталонные значения (устанавливаются пользователем)
  standard_volume_liters DECIMAL(10, 3),
  standard_weight_kg DECIMAL(10, 3),
  standard_length_cm DECIMAL(10, 2),
  standard_width_cm DECIMAL(10, 2),
  standard_height_cm DECIMAL(10, 2),

  -- Допустимое отклонение (%)
  tolerance_percent DECIMAL(5, 2) DEFAULT 5.0,

  -- Метаданные
  set_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(marketplace_id, offer_id)
);

-- Create product_volume_history table (история измерений)
CREATE TABLE IF NOT EXISTS public.product_volume_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  offer_id TEXT NOT NULL,
  sku TEXT NOT NULL,

  -- Объемные характеристики (из API ОЗОН)
  volume_liters DECIMAL(10, 3),
  weight_kg DECIMAL(10, 3),
  length_cm DECIMAL(10, 2),
  width_cm DECIMAL(10, 2),
  height_cm DECIMAL(10, 2),

  -- Отклонение от эталона
  is_different_from_standard BOOLEAN DEFAULT FALSE,

  -- Дата и источник
  measured_date DATE NOT NULL,
  data_source TEXT DEFAULT 'ozon_api',  -- 'ozon_api', 'manual'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(marketplace_id, offer_id, measured_date)
);

-- Enable RLS
ALTER TABLE public.product_volume_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_volume_history ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_volume_standards_marketplace ON public.product_volume_standards(marketplace_id);
CREATE INDEX idx_volume_standards_offer ON public.product_volume_standards(marketplace_id, offer_id);

CREATE INDEX idx_volume_history_marketplace ON public.product_volume_history(marketplace_id);
CREATE INDEX idx_volume_history_offer ON public.product_volume_history(marketplace_id, offer_id, measured_date DESC);
CREATE INDEX idx_volume_history_different ON public.product_volume_history(marketplace_id, is_different_from_standard)
  WHERE is_different_from_standard = TRUE;

-- RLS Policies for product_volume_standards
CREATE POLICY "Users can view volume standards from own marketplaces"
  ON public.product_volume_standards FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_standards.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage volume standards from own marketplaces"
  ON public.product_volume_standards FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_standards.marketplace_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_standards.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for product_volume_history
CREATE POLICY "Users can view volume history from own marketplaces"
  ON public.product_volume_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_history.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert volume history"
  ON public.product_volume_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_volume_history.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Add update trigger for standards
CREATE TRIGGER update_volume_standards_updated_at
  BEFORE UPDATE ON public.product_volume_standards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create view for current volume status
CREATE OR REPLACE VIEW public.product_current_volume AS
WITH latest_measurements AS (
  SELECT DISTINCT ON (marketplace_id, offer_id)
    marketplace_id,
    offer_id,
    sku,
    volume_liters,
    weight_kg,
    length_cm,
    width_cm,
    height_cm,
    measured_date,
    is_different_from_standard,
    data_source
  FROM public.product_volume_history
  ORDER BY marketplace_id, offer_id, measured_date DESC
)
SELECT
  lm.*,
  pvs.standard_volume_liters,
  pvs.standard_weight_kg,
  pvs.tolerance_percent,
  CASE
    WHEN pvs.standard_volume_liters IS NOT NULL AND lm.volume_liters IS NOT NULL
    THEN ABS(lm.volume_liters - pvs.standard_volume_liters) / pvs.standard_volume_liters * 100
    ELSE NULL
  END as deviation_percent,
  CASE
    WHEN pvs.standard_volume_liters IS NOT NULL AND lm.volume_liters IS NOT NULL
    THEN ABS(lm.volume_liters - pvs.standard_volume_liters) / pvs.standard_volume_liters * 100 > pvs.tolerance_percent
    ELSE FALSE
  END as exceeds_tolerance
FROM latest_measurements lm
LEFT JOIN public.product_volume_standards pvs
  ON lm.marketplace_id = pvs.marketplace_id
  AND lm.offer_id = pvs.offer_id;
-- =====================================================
-- Migration: Create import_logs table
-- Date: 2025-12-06
-- Description: История загрузок файлов и импорта данных
-- =====================================================

-- Create import_logs table
CREATE TABLE IF NOT EXISTS public.import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Тип импорта
  import_type TEXT NOT NULL,  -- 'accruals', 'storage_costs', 'promotion_costs', 'business_data'
  file_name TEXT,
  period_start DATE,
  period_end DATE,

  -- Статус
  status TEXT DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
  records_imported INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,

  -- Метаданные
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_import_logs_marketplace ON public.import_logs(marketplace_id, import_type, created_at DESC);
CREATE INDEX idx_import_logs_status ON public.import_logs(marketplace_id, status)
  WHERE status = 'processing';
CREATE INDEX idx_import_logs_user ON public.import_logs(user_id)
  WHERE user_id IS NOT NULL;

-- RLS Policies
CREATE POLICY "Users can view import logs from own marketplaces"
  ON public.import_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = import_logs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create import logs for own marketplaces"
  ON public.import_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = import_logs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update import logs for own marketplaces"
  ON public.import_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = import_logs.marketplace_id AND m.user_id = auth.uid()
    )
  );
-- =====================================================
-- Migration: Create ozon_accruals table
-- Date: 2025-12-06
-- Description: Отчет о начислениях ОЗОН (детализация по дням и типам)
-- =====================================================

-- Create ozon_accruals table
CREATE TABLE IF NOT EXISTS public.ozon_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Дата операции
  accrual_date DATE NOT NULL,

  -- Идентификаторы (offer_id главный, sku опционально)
  offer_id TEXT NOT NULL,
  sku TEXT,

  -- Данные из отчета ОЗОН
  accrual_type TEXT NOT NULL,  -- "Тип начисления" (как есть из ОЗОН)
  quantity DECIMAL(10, 3) DEFAULT 0,
  amount_before_commission DECIMAL(10, 2) DEFAULT 0,  -- "За продажу до вычета комиссий"
  total_amount DECIMAL(10, 2) DEFAULT 0,  -- "Итого"

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, accrual_date, offer_id, accrual_type)
);

-- Enable RLS
ALTER TABLE public.ozon_accruals ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_ozon_accruals_marketplace ON public.ozon_accruals(marketplace_id);
CREATE INDEX idx_ozon_accruals_date ON public.ozon_accruals(marketplace_id, accrual_date DESC);
CREATE INDEX idx_ozon_accruals_offer ON public.ozon_accruals(marketplace_id, offer_id);
CREATE INDEX idx_ozon_accruals_type ON public.ozon_accruals(marketplace_id, accrual_type);
CREATE INDEX idx_ozon_accruals_date_range ON public.ozon_accruals(marketplace_id, accrual_date)
  WHERE accrual_date >= CURRENT_DATE - INTERVAL '90 days';  -- Для быстрых запросов за последние 3 месяца

-- RLS Policies
CREATE POLICY "Users can view accruals from own marketplaces"
  ON public.ozon_accruals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert accruals"
  ON public.ozon_accruals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update accruals"
  ON public.ozon_accruals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can delete accruals"
  ON public.ozon_accruals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_accruals.marketplace_id AND m.user_id = auth.uid()
    )
  );
-- =====================================================
-- Migration: Create storage_costs table
-- Date: 2025-12-06
-- Description: Стоимость размещения товаров на складе ОЗОН + остатки
-- =====================================================

-- Create storage_costs table
CREATE TABLE IF NOT EXISTS public.storage_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Дата
  cost_date DATE NOT NULL,

  -- Идентификаторы
  offer_id TEXT NOT NULL,
  sku TEXT,

  -- Данные из отчета ОЗОН
  storage_cost DECIMAL(10, 2) DEFAULT 0,  -- "Начисленная стоимость размещения"
  stock_quantity INTEGER DEFAULT 0,       -- "Кол-во экземпляров" (остаток на складе)

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, cost_date, offer_id)
);

-- Enable RLS
ALTER TABLE public.storage_costs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_storage_costs_marketplace ON public.storage_costs(marketplace_id);
CREATE INDEX idx_storage_costs_date ON public.storage_costs(marketplace_id, cost_date DESC);
CREATE INDEX idx_storage_costs_offer ON public.storage_costs(marketplace_id, offer_id);
CREATE INDEX idx_storage_costs_date_range ON public.storage_costs(marketplace_id, cost_date)
  WHERE cost_date >= CURRENT_DATE - INTERVAL '90 days';

-- RLS Policies
CREATE POLICY "Users can view storage costs from own marketplaces"
  ON public.storage_costs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert storage costs"
  ON public.storage_costs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update storage costs"
  ON public.storage_costs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can delete storage costs"
  ON public.storage_costs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = storage_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );
-- =====================================================
-- Migration: Create promotion_costs table
-- Date: 2025-12-06
-- Description: Затраты на продвижение товаров (реклама ОЗОН)
-- =====================================================

-- Create promotion_costs table
CREATE TABLE IF NOT EXISTS public.promotion_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Период (из отчета ОЗОН, обычно за неделю или месяц)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Идентификаторы
  sku TEXT NOT NULL,        -- Из отчета ОЗОН (обычно только SKU)
  offer_id TEXT,            -- Найдем через lookup или заполним триггером

  -- Данные из отчета ОЗОН
  promotion_type TEXT,      -- "Тип продвижения"
  promotion_cost DECIMAL(10, 2) DEFAULT 0,  -- "Расход ₽ с НДС"

  -- Метрики (если есть в отчете)
  impressions INTEGER,      -- Показы
  clicks INTEGER,           -- Клики
  orders INTEGER,           -- Заказы
  revenue DECIMAL(10, 2),   -- Выручка

  -- Метаданные
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_batch_id UUID REFERENCES public.import_logs(id) ON DELETE SET NULL,

  UNIQUE(marketplace_id, period_start, period_end, sku, promotion_type)
);

-- Enable RLS
ALTER TABLE public.promotion_costs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_promotion_costs_marketplace ON public.promotion_costs(marketplace_id);
CREATE INDEX idx_promotion_costs_period ON public.promotion_costs(marketplace_id, period_start DESC, period_end DESC);
CREATE INDEX idx_promotion_costs_sku ON public.promotion_costs(marketplace_id, sku);
CREATE INDEX idx_promotion_costs_offer ON public.promotion_costs(marketplace_id, offer_id)
  WHERE offer_id IS NOT NULL;
CREATE INDEX idx_promotion_costs_type ON public.promotion_costs(marketplace_id, promotion_type)
  WHERE promotion_type IS NOT NULL;

-- RLS Policies
CREATE POLICY "Users can view promotion costs from own marketplaces"
  ON public.promotion_costs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert promotion costs"
  ON public.promotion_costs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can update promotion costs"
  ON public.promotion_costs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can delete promotion costs"
  ON public.promotion_costs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = promotion_costs.marketplace_id AND m.user_id = auth.uid()
    )
  );
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
-- =====================================================
-- Migration: Create product knowledge base table
-- Date: 2025-12-06
-- Description: База знаний о товарах для улучшения ИИ-ответов
-- ВАЖНО: Автосохранение ОТКЛЮЧЕНО. Знания добавляются только вручную!
-- =====================================================

-- Main table: product_knowledge
CREATE TABLE IF NOT EXISTS public.product_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Classification
  source_type TEXT NOT NULL CHECK (source_type IN (
    'supplier',           -- Информация от поставщика
    'manager',           -- Знания менеджера (РУЧНОЙ ВВОД)
    'faq',              -- Частые вопросы
    'instruction',      -- Инструкции по использованию
    'specification'     -- Технические характеристики
  )),

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  relevance_score DECIMAL(3,2) DEFAULT 1.0 CHECK (relevance_score >= 0 AND relevance_score <= 1),

  -- Source tracking
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_review_id UUID REFERENCES public.reviews(id) ON DELETE SET NULL,
  source_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  source_reply_id UUID REFERENCES public.replies(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_source_link CHECK (
    (source_review_id IS NOT NULL) OR
    (source_question_id IS NOT NULL) OR
    (source_reply_id IS NOT NULL) OR
    (source_type IN ('supplier', 'faq', 'instruction', 'specification'))
  )
);

-- Indexes for performance
CREATE INDEX idx_product_knowledge_product ON public.product_knowledge(product_id);
CREATE INDEX idx_product_knowledge_marketplace ON public.product_knowledge(marketplace_id);
CREATE INDEX idx_product_knowledge_source_type ON public.product_knowledge(source_type);
CREATE INDEX idx_product_knowledge_tags ON public.product_knowledge USING gin(tags);
CREATE INDEX idx_product_knowledge_created_at ON public.product_knowledge(created_at DESC);

-- Full-text search index
CREATE INDEX idx_product_knowledge_content_search ON public.product_knowledge
  USING gin(to_tsvector('russian', content));
CREATE INDEX idx_product_knowledge_title_search ON public.product_knowledge
  USING gin(to_tsvector('russian', title));

-- Trigger: Update updated_at timestamp
CREATE TRIGGER trigger_update_product_knowledge_timestamp
  BEFORE UPDATE ON public.product_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function: Get relevant knowledge for product
CREATE OR REPLACE FUNCTION public.get_product_knowledge(
  p_product_id UUID,
  p_limit INTEGER DEFAULT 5
) RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  source_type TEXT,
  relevance_score DECIMAL(3,2),
  tags TEXT[],
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pk.id,
    pk.title,
    pk.content,
    pk.source_type,
    pk.relevance_score,
    pk.tags,
    pk.created_at
  FROM public.product_knowledge pk
  WHERE pk.product_id = p_product_id
  ORDER BY pk.relevance_score DESC, pk.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Search knowledge base by text
CREATE OR REPLACE FUNCTION public.search_product_knowledge(
  p_product_id UUID,
  p_search_text TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  source_type TEXT,
  relevance_score DECIMAL(3,2),
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pk.id,
    pk.title,
    pk.content,
    pk.source_type,
    pk.relevance_score,
    ts_rank(
      to_tsvector('russian', pk.title || ' ' || pk.content),
      plainto_tsquery('russian', p_search_text)
    ) as rank
  FROM public.product_knowledge pk
  WHERE pk.product_id = p_product_id
    AND (
      to_tsvector('russian', pk.title || ' ' || pk.content) @@
      plainto_tsquery('russian', p_search_text)
    )
  ORDER BY rank DESC, pk.relevance_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE public.product_knowledge ENABLE ROW LEVEL SECURITY;

-- Users can view knowledge for their marketplace
CREATE POLICY "Users can view product knowledge for their marketplace"
  ON public.product_knowledge
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_knowledge.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Users can insert knowledge for their marketplace
CREATE POLICY "Users can insert product knowledge for their marketplace"
  ON public.product_knowledge
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_knowledge.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Users can update their own knowledge entries
CREATE POLICY "Users can update their own product knowledge"
  ON public.product_knowledge
  FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_knowledge.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Users can delete their own knowledge entries
CREATE POLICY "Users can delete their own product knowledge"
  ON public.product_knowledge
  FOR DELETE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = product_knowledge.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_product_knowledge TO authenticated;

-- Comments
COMMENT ON TABLE public.product_knowledge IS 'База знаний о товарах для улучшения качества ИИ-ответов. Заполняется ТОЛЬКО ВРУЧНУЮ менеджерами.';
COMMENT ON COLUMN public.product_knowledge.source_type IS 'Источник информации: supplier, manager, faq, instruction, specification (БЕЗ auto_reply!)';
COMMENT ON COLUMN public.product_knowledge.relevance_score IS 'Оценка релевантности записи (0.0 - 1.0)';
-- =====================================================
-- Migration: Add cross-marketplace knowledge views
-- Date: 2025-12-06
-- Description: Поддержка получения знаний по offer_id со всех площадок
-- =====================================================

-- View: Product knowledge by offer_id
-- Позволяет получать знания о товаре по артикулу (offer_id) со всех площадок
CREATE OR REPLACE VIEW public.product_knowledge_by_offer AS
SELECT
  p.offer_id,
  pk.marketplace_id,
  pk.id,
  pk.product_id,
  pk.title,
  pk.content,
  pk.source_type,
  pk.tags,
  pk.relevance_score,
  pk.created_by,
  pk.source_review_id,
  pk.source_question_id,
  pk.source_reply_id,
  pk.created_at,
  pk.updated_at,
  p.name as product_name,
  m.name as marketplace_name,
  m.type as marketplace_type
FROM public.product_knowledge pk
JOIN public.products p ON pk.product_id = p.id
JOIN public.marketplaces m ON pk.marketplace_id = m.id;

-- Function: Get knowledge for offer across all marketplaces
CREATE OR REPLACE FUNCTION public.get_knowledge_for_offer(
  p_offer_id TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  marketplace_id UUID,
  marketplace_name TEXT,
  product_id UUID,
  title TEXT,
  content TEXT,
  source_type TEXT,
  relevance_score DECIMAL(3,2),
  tags TEXT[],
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pk.id,
    pk.marketplace_id,
    m.name as marketplace_name,
    pk.product_id,
    pk.title,
    pk.content,
    pk.source_type,
    pk.relevance_score,
    pk.tags,
    pk.created_at
  FROM public.product_knowledge pk
  JOIN public.products p ON pk.product_id = p.id
  JOIN public.marketplaces m ON pk.marketplace_id = m.id
  WHERE p.offer_id = p_offer_id
  ORDER BY pk.relevance_score DESC, pk.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get knowledge for specific marketplace + offer
CREATE OR REPLACE FUNCTION public.get_knowledge_for_product_with_fallback(
  p_marketplace_id UUID,
  p_offer_id TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  marketplace_id UUID,
  marketplace_name TEXT,
  product_id UUID,
  title TEXT,
  content TEXT,
  source_type TEXT,
  relevance_score DECIMAL(3,2),
  tags TEXT[],
  created_at TIMESTAMPTZ,
  is_from_same_marketplace BOOLEAN
) AS $$
BEGIN
  -- Сначала возвращаем знания с той же площадки
  -- Затем знания с других площадок (для того же offer_id)
  RETURN QUERY
  WITH same_marketplace AS (
    SELECT
      pk.id,
      pk.marketplace_id,
      m.name as marketplace_name,
      pk.product_id,
      pk.title,
      pk.content,
      pk.source_type,
      pk.relevance_score,
      pk.tags,
      pk.created_at,
      TRUE as is_from_same_marketplace
    FROM public.product_knowledge pk
    JOIN public.products p ON pk.product_id = p.id
    JOIN public.marketplaces m ON pk.marketplace_id = m.id
    WHERE p.offer_id = p_offer_id
      AND pk.marketplace_id = p_marketplace_id
    ORDER BY pk.relevance_score DESC, pk.created_at DESC
    LIMIT p_limit
  ),
  other_marketplaces AS (
    SELECT
      pk.id,
      pk.marketplace_id,
      m.name as marketplace_name,
      pk.product_id,
      pk.title,
      pk.content,
      pk.source_type,
      pk.relevance_score * 0.8 as relevance_score,  -- Немного снижаем релевантность
      pk.tags,
      pk.created_at,
      FALSE as is_from_same_marketplace
    FROM public.product_knowledge pk
    JOIN public.products p ON pk.product_id = p.id
    JOIN public.marketplaces m ON pk.marketplace_id = m.id
    WHERE p.offer_id = p_offer_id
      AND pk.marketplace_id != p_marketplace_id
    ORDER BY pk.relevance_score DESC, pk.created_at DESC
    LIMIT p_limit
  )
  SELECT * FROM same_marketplace
  UNION ALL
  SELECT * FROM other_marketplaces
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Search knowledge across all marketplaces for offer
CREATE OR REPLACE FUNCTION public.search_knowledge_for_offer(
  p_offer_id TEXT,
  p_search_text TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  id UUID,
  marketplace_id UUID,
  marketplace_name TEXT,
  product_id UUID,
  title TEXT,
  content TEXT,
  source_type TEXT,
  relevance_score DECIMAL(3,2),
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pk.id,
    pk.marketplace_id,
    m.name as marketplace_name,
    pk.product_id,
    pk.title,
    pk.content,
    pk.source_type,
    pk.relevance_score,
    ts_rank(
      to_tsvector('russian', pk.title || ' ' || pk.content),
      plainto_tsquery('russian', p_search_text)
    ) as rank
  FROM public.product_knowledge pk
  JOIN public.products p ON pk.product_id = p.id
  JOIN public.marketplaces m ON pk.marketplace_id = m.id
  WHERE p.offer_id = p_offer_id
    AND (
      to_tsvector('russian', pk.title || ' ' || pk.content) @@
      plainto_tsquery('russian', p_search_text)
    )
  ORDER BY rank DESC, pk.relevance_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- View: Knowledge statistics by offer
CREATE OR REPLACE VIEW public.product_knowledge_stats_by_offer AS
SELECT
  p.offer_id,
  COUNT(pk.id) as total_knowledge_entries,
  COUNT(DISTINCT pk.marketplace_id) as marketplaces_count,
  COUNT(CASE WHEN pk.source_type = 'supplier' THEN 1 END) as supplier_entries,
  COUNT(CASE WHEN pk.source_type = 'manager' THEN 1 END) as manager_entries,
  COUNT(CASE WHEN pk.source_type = 'faq' THEN 1 END) as faq_entries,
  COUNT(CASE WHEN pk.source_type = 'instruction' THEN 1 END) as instruction_entries,
  MAX(pk.created_at) as last_updated
FROM public.products p
LEFT JOIN public.product_knowledge pk ON pk.product_id = p.id
GROUP BY p.offer_id;

-- Grant permissions
GRANT SELECT ON public.product_knowledge_by_offer TO authenticated;
GRANT SELECT ON public.product_knowledge_stats_by_offer TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_knowledge_for_offer TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_knowledge_for_product_with_fallback TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge_for_offer TO authenticated;

-- Comments
COMMENT ON VIEW public.product_knowledge_by_offer IS 'База знаний о товарах с группировкой по offer_id (артикулу продавца)';
COMMENT ON FUNCTION public.get_knowledge_for_offer IS 'Получить знания о товаре по артикулу со всех площадок';
COMMENT ON FUNCTION public.get_knowledge_for_product_with_fallback IS 'Получить знания сначала с текущей площадки, затем с других';
COMMENT ON FUNCTION public.search_knowledge_for_offer IS 'Полнотекстовый поиск знаний по артикулу на всех площадках';
COMMENT ON VIEW public.product_knowledge_stats_by_offer IS 'Статистика по базе знаний в разрезе артикулов';
