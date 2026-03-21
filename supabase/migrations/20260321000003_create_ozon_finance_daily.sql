-- =====================================================
-- ТАБЛИЦА ozon_finance_daily
-- Агрегированные финансовые данные по offer_id за день
-- Источник: Ozon Finance API /v3/finance/transaction/list
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ozon_finance_daily (
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  offer_id       TEXT NOT NULL,

  -- Выручка (положительная)
  sale_amount             DECIMAL(12,2) NOT NULL DEFAULT 0,  -- выручка с выкупов
  -- Расходы (хранятся как отрицательные числа, такими и приходят из Ozon)
  commission              DECIMAL(12,2) NOT NULL DEFAULT 0,  -- комиссия Ozon
  logistics_to_customer   DECIMAL(12,2) NOT NULL DEFAULT 0,  -- логистика к покупателю
  logistics_return        DECIMAL(12,2) NOT NULL DEFAULT 0,  -- логистика возвратов/отмен
  acquiring               DECIMAL(12,2) NOT NULL DEFAULT 0,  -- эквайринг
  other_expenses          DECIMAL(12,2) NOT NULL DEFAULT 0,  -- прочие начисления площадки

  -- Итого к выплате (= sale_amount + commission + logistics + acquiring + other)
  disbursement            DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Метаданные
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (marketplace_id, date, offer_id)
);

-- RLS
ALTER TABLE public.ozon_finance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own finance data"
  ON public.ozon_finance_daily FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_finance_daily.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- Service role can do everything (для Edge Functions)
CREATE POLICY "Service role full access to finance daily"
  ON public.ozon_finance_daily FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Индексы
CREATE INDEX idx_ozon_finance_daily_mp_date
  ON public.ozon_finance_daily(marketplace_id, date DESC);

CREATE INDEX idx_ozon_finance_daily_mp_offer
  ON public.ozon_finance_daily(marketplace_id, offer_id);

COMMENT ON TABLE public.ozon_finance_daily IS
'Агрегированные финансовые данные из Ozon /v3/finance/transaction/list.
Одна строка на (marketplace_id, date, offer_id). Синкается ежедневно.
commission/logistics/acquiring — отрицательные суммы (расходы как в Ozon API).';
