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
    (source_type IN ('supplier', 'manager', 'faq', 'instruction', 'specification'))
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
