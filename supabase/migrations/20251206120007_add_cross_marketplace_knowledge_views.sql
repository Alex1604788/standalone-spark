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
