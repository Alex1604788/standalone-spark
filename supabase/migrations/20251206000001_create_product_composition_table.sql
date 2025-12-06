-- Create product_composition table to store product kit compositions
-- This allows products to be composed of other products with quantities
-- Example: Product "21701_10" consists of 10x Product "21701"

CREATE TABLE IF NOT EXISTS public.product_composition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  parent_offer_id TEXT NOT NULL,  -- Артикул комплекта (например, 21701_10)
  child_offer_id TEXT NOT NULL,   -- Артикул составляющего товара (например, 21701)
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(marketplace_id, parent_offer_id, child_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_product_composition_parent ON public.product_composition(marketplace_id, parent_offer_id);
CREATE INDEX IF NOT EXISTS idx_product_composition_child ON public.product_composition(marketplace_id, child_offer_id);

COMMENT ON TABLE public.product_composition IS 'Состав товаров (комплектаций). Товар может состоять из нескольких других товаров. Для простоты расчетов все товары имеют состав (даже если товар А = товар А × 1).';
COMMENT ON COLUMN public.product_composition.parent_offer_id IS 'Артикул комплекта';
COMMENT ON COLUMN public.product_composition.child_offer_id IS 'Артикул составляющего товара';
COMMENT ON COLUMN public.product_composition.quantity IS 'Количество составляющего товара в комплекте';

-- Enable RLS
ALTER TABLE public.product_composition ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view compositions for their marketplaces"
  ON public.product_composition FOR SELECT
  USING (
    marketplace_id IN (
      SELECT m.id FROM public.marketplaces m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert compositions for their marketplaces"
  ON public.product_composition FOR INSERT
  WITH CHECK (
    marketplace_id IN (
      SELECT m.id FROM public.marketplaces m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update compositions for their marketplaces"
  ON public.product_composition FOR UPDATE
  USING (
    marketplace_id IN (
      SELECT m.id FROM public.marketplaces m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete compositions for their marketplaces"
  ON public.product_composition FOR DELETE
  USING (
    marketplace_id IN (
      SELECT m.id FROM public.marketplaces m
      WHERE m.user_id = auth.uid()
    )
  );
