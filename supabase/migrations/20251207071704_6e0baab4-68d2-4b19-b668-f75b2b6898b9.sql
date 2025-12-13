-- Пересоздаём функцию get_knowledge_for_product_with_fallback с правильным полем
CREATE OR REPLACE FUNCTION public.get_knowledge_for_product_with_fallback(
  p_marketplace_id uuid,
  p_offer_id text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  marketplace_id uuid,
  marketplace_name text,
  product_id uuid,
  title text,
  content text,
  source_type text,
  relevance_score numeric,
  tags text[],
  created_at timestamptz,
  is_from_same_marketplace boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
      pk.relevance_score * 0.8 as relevance_score,
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
$$;