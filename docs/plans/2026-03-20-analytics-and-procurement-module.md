# Analytics & Procurement Module — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full analytics module (sales, products, ads, stocks, charts) + procurement/distribution block inside standalone-spark, with UX far superior to Kultura Analitiki (KAN).

**Architecture:**
- Supabase (PostgreSQL + Edge Functions) as backend — extend existing schema.
- React + TanStack Query on frontend — add new pages under existing routing.
- No new frameworks — reuse existing shadcn/ui, Recharts (if present) or add Recharts, existing auth/marketplace context.

**Tech Stack:** React 18, TypeScript, Supabase, TanStack Query, shadcn/ui, Recharts, date-fns

---

## UX PRINCIPLES — Better Than KAN

KAN problems to fix:
1. **103-column horizontal scroll hell** → Column group toggles, only key columns shown by default, users add more
2. **No metric explanations** → Tooltip on every metric header with formula + benchmark
3. **No visual hierarchy** → Summary KPI cards above table, then detail
4. **Massive table is primary UI** → Charts/trends as primary view, table as drill-down
5. **No quick context** → Inline traffic-light coloring with thresholds visible

Our approach:
- **Card → Chart → Table** hierarchy (not table-first)
- **Sticky product column** always visible while scrolling
- **Column groups**: Sales | Ads | Funnel | Stocks | Profitability — each toggleable
- **Metric tooltips** with formula + what's good/bad
- **Date presets**: Today / 7d / 30d / 90d / custom
- **Mini sparklines** in product rows showing 7-day trend

---

## PHASE 1 — Data Layer (Supabase)

### Task 1: New analytics tables migration

**Files:**
- Create: `supabase/migrations/20260320000001_create_analytics_tables.sql`

**Step 1: Write migration**

```sql
-- Ежедневная аналитика из Ozon API /v1/analytics/data
CREATE TABLE IF NOT EXISTS public.ozon_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  date DATE NOT NULL,

  -- Сессии и воронка
  session_view INTEGER DEFAULT 0,
  percent_session_to_pdp NUMERIC(10,4),
  percent_pdp_to_cart NUMERIC(10,4),
  percent_cart_to_order NUMERIC(10,4),
  percent_order_to_buy NUMERIC(10,4),
  percent_pdp_to_order NUMERIC(10,4),

  -- Заказы
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

  -- Цены
  price_seller NUMERIC(15,2),
  price_ozon NUMERIC(15,2),
  price_index NUMERIC(10,4),
  content_rating NUMERIC(10,4),

  -- Финансы (из accruals)
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

-- Снимки остатков
CREATE TABLE IF NOT EXISTS public.ozon_stocks_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  sku TEXT,
  date DATE NOT NULL,
  fbo_stocks INTEGER DEFAULT 0,
  fbs_stocks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, offer_id, date)
);

-- Себестоимость (уже есть как cost_price в products? — отдельная таблица для истории)
CREATE TABLE IF NOT EXISTS public.product_cost_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  cost_price NUMERIC(15,2) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, offer_id, valid_from)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_ozon_analytics_daily_mp_date ON public.ozon_analytics_daily(marketplace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ozon_analytics_daily_offer ON public.ozon_analytics_daily(marketplace_id, offer_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ozon_stocks_daily_mp_date ON public.ozon_stocks_daily(marketplace_id, date DESC);

-- RLS
ALTER TABLE public.ozon_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ozon_stocks_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own analytics" ON public.ozon_analytics_daily
  FOR ALL USING (marketplace_id IN (
    SELECT id FROM public.marketplaces WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users see own stocks" ON public.ozon_stocks_daily
  FOR ALL USING (marketplace_id IN (
    SELECT id FROM public.marketplaces WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users see own cost prices" ON public.product_cost_prices
  FOR ALL USING (marketplace_id IN (
    SELECT id FROM public.marketplaces WHERE user_id = auth.uid()
  ));
```

**Step 2: Apply migration**
```bash
supabase db push
```
Expected: Migration applied successfully

**Step 3: Verify tables exist**
```bash
supabase db reset --linked
# or check in Supabase dashboard
```

**Step 4: Commit**
```bash
git add supabase/migrations/20260320000001_create_analytics_tables.sql
git commit -m "feat: add ozon_analytics_daily, ozon_stocks_daily, product_cost_prices tables"
```

---

### Task 2: Edge Function — sync-ozon-analytics

**Files:**
- Create: `supabase/functions/sync-ozon-analytics/index.ts`

This function calls Ozon `/v1/analytics/data` and upserts into `ozon_analytics_daily`.

**Step 1: Create function**

```typescript
// supabase/functions/sync-ozon-analytics/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const METRICS = [
  "session_view","percent_session_to_pdp","percent_pdp_to_cart",
  "percent_cart_to_order","percent_order_to_buy","percent_pdp_to_order",
  "ordered_cnt","ordered_amount","bought_cnt","bought_amount",
  "returned_cnt","cancelled_cnt",
  "adv_views","adv_clicks","adv_carts","adv_orders","adv_revenue","adv_expenses",
  "adv_cpc","adv_cpm","adv_cpcart","adv_cpo","adv_cpo_general",
  "percent_ctr","percent_drr","percent_adv_drr",
  "price_seller","price_ozon","price_index","content_rating",
];

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const { marketplace_id, date_from, date_to } = body;

  // Get all marketplaces if no specific one given
  const { data: mps } = marketplace_id
    ? await supabase.from("marketplaces").select("id,api_key,client_id").eq("id", marketplace_id)
    : await supabase.from("marketplaces").select("id,api_key,client_id").not("api_key", "is", null);

  const results = [];

  for (const mp of (mps || [])) {
    const to = date_to || new Date().toISOString().split("T")[0];
    const from = date_from || new Date(Date.now() - 30*86400000).toISOString().split("T")[0];

    // Ozon analytics API
    const ozonResp = await fetch("https://api-seller.ozon.ru/v1/analytics/data", {
      method: "POST",
      headers: {
        "Client-Id": mp.client_id,
        "Api-Key": mp.api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date_from: from,
        date_to: to,
        metrics: METRICS,
        dimension: ["sku", "day"],
        filters: [],
        limit: 1000,
        offset: 0,
      }),
    });

    if (!ozonResp.ok) {
      results.push({ marketplace_id: mp.id, error: await ozonResp.text() });
      continue;
    }

    const { result } = await ozonResp.json();
    const rows = (result?.data || []).map((row: any) => {
      const obj: any = {
        marketplace_id: mp.id,
        offer_id: row.dimensions?.[0]?.id || "",  // sku as key; match to products
        date: row.dimensions?.[1]?.id || from,
      };
      (row.metrics || []).forEach((val: number, i: number) => {
        obj[METRICS[i]] = val ?? null;
      });
      return obj;
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from("ozon_analytics_daily")
        .upsert(rows, { onConflict: "marketplace_id,offer_id,date" });
      results.push({ marketplace_id: mp.id, upserted: rows.length, error });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

**Step 2: Add cron (via pg_cron or supabase cron)**

Add to migrations or Supabase dashboard:
```sql
-- Every night at 2am sync last 2 days
SELECT cron.schedule(
  'sync-ozon-analytics-daily',
  '0 2 * * *',
  $$SELECT net.http_post(url:='https://<project>.supabase.co/functions/v1/sync-ozon-analytics',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{"date_from":"' || (NOW()-INTERVAL'2 days')::date || '","date_to":"' || NOW()::date || '"}'::jsonb
  )$$
);
```

**Step 3: Also sync stocks**

Create: `supabase/functions/sync-ozon-stocks/index.ts`
Calls Ozon `/v2/analytics/stock_on_warehouses` and upserts into `ozon_stocks_daily`.

**Step 4: Deploy functions**
```bash
supabase functions deploy sync-ozon-analytics
supabase functions deploy sync-ozon-stocks
```

**Step 5: Commit**
```bash
git add supabase/functions/sync-ozon-analytics/
git add supabase/functions/sync-ozon-stocks/
git commit -m "feat: add sync-ozon-analytics and sync-ozon-stocks edge functions"
```

---

### Task 3: TypeScript hook — useOzonAnalytics

**Files:**
- Create: `src/hooks/useOzonAnalytics.ts`
- Create: `src/lib/analytics-calculations.ts`

**Step 1: Analytics calculations library**

```typescript
// src/lib/analytics-calculations.ts

export interface OzonDailyRow {
  offer_id: string;
  date: string;
  ordered_cnt: number;
  ordered_amount: number;
  bought_cnt: number;
  bought_amount: number;
  returned_cnt: number;
  cancelled_cnt: number;
  adv_views: number;
  adv_clicks: number;
  adv_expenses: number;
  adv_revenue: number;
  session_view: number;
  percent_session_to_pdp: number;
  percent_pdp_to_cart: number;
  percent_cart_to_order: number;
  percent_order_to_buy: number;
  fbo_stocks?: number;
  fbs_stocks?: number;
  cost_price?: number;
  bought_commission?: number;
  bought_expense?: number;
  marketplace_expenses?: number;
  acquiring?: number;
  taxes?: number;
}

export interface ProductMetrics {
  offer_id: string;
  product_name?: string;
  // Sales
  ordered_cnt: number;
  ordered_amount: number;
  bought_cnt: number;
  bought_amount: number;
  returned_cnt: number;
  cancelled_cnt: number;
  percent_cancellations_and_returns: number;
  // Ads
  adv_views: number;
  adv_clicks: number;
  adv_expenses: number;
  adv_revenue: number;
  percent_ctr: number;
  percent_drr: number;
  percent_adv_drr: number;
  adv_cpc: number;
  adv_cpo: number;
  // Funnel
  session_view: number;
  percent_session_to_pdp: number;
  percent_pdp_to_cart: number;
  percent_cart_to_order: number;
  percent_order_to_buy: number;
  // Stocks
  fbo_stocks: number;
  fbs_stocks: number;
  turnover_days: number;
  available_in_days: number;
  // Profitability
  profit: number;
  profit_unit: number;
  margin_percent: number;
  roi_percent: number;
  ros_percent: number;
  cost_price_total: number;
}

export function aggregateToProductMetrics(rows: OzonDailyRow[]): ProductMetrics[] {
  const map = new Map<string, OzonDailyRow[]>();
  for (const r of rows) {
    if (!map.has(r.offer_id)) map.set(r.offer_id, []);
    map.get(r.offer_id)!.push(r);
  }

  return Array.from(map.entries()).map(([offer_id, rr]) => {
    const sum = (key: keyof OzonDailyRow) =>
      rr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

    const ordered_cnt = sum("ordered_cnt");
    const bought_cnt = sum("bought_cnt");
    const ordered_amount = sum("ordered_amount");
    const bought_amount = sum("bought_amount");
    const returned_cnt = sum("returned_cnt");
    const cancelled_cnt = sum("cancelled_cnt");
    const adv_views = sum("adv_views");
    const adv_clicks = sum("adv_clicks");
    const adv_expenses = sum("adv_expenses");
    const adv_revenue = sum("adv_revenue");
    const bought_commission = sum("bought_commission");
    const bought_expense = sum("bought_expense");
    const marketplace_expenses = sum("marketplace_expenses");
    const acquiring = sum("acquiring");
    const cost_price_total = sum("cost_price");

    // Last known stocks
    const lastRow = rr[rr.length - 1];
    const fbo_stocks = lastRow.fbo_stocks ?? 0;
    const fbs_stocks = lastRow.fbs_stocks ?? 0;

    // Weekly avg for turnover
    const days = rr.length || 1;
    const avg_week_ordered = (ordered_cnt / days) * 7;
    const turnover_days = avg_week_ordered > 0
      ? ((fbo_stocks + fbs_stocks) / avg_week_ordered) * 7 : 0;
    const available_in_days = avg_week_ordered > 0
      ? (fbo_stocks / avg_week_ordered) * 7 : 0;

    // Profit = bought_amount - commissions - expenses - cost - acquiring
    const profit = bought_amount - bought_commission - bought_expense
      - marketplace_expenses - acquiring - cost_price_total;
    const profit_unit = bought_cnt > 0 ? profit / bought_cnt : 0;
    const margin_percent = cost_price_total > 0
      ? ((bought_amount - cost_price_total) / cost_price_total) * 100 : 0;
    const ros_percent = bought_amount > 0 ? (profit / bought_amount) * 100 : 0;
    const roi_percent = (cost_price_total + marketplace_expenses) > 0
      ? (profit / (cost_price_total + marketplace_expenses)) * 100 : 0;

    return {
      offer_id,
      ordered_cnt,
      ordered_amount,
      bought_cnt,
      bought_amount,
      returned_cnt,
      cancelled_cnt,
      percent_cancellations_and_returns: ordered_cnt > 0
        ? ((returned_cnt + cancelled_cnt) / ordered_cnt) * 100 : 0,
      adv_views,
      adv_clicks,
      adv_expenses,
      adv_revenue,
      percent_ctr: adv_views > 0 ? (adv_clicks / adv_views) * 100 : 0,
      percent_drr: ordered_amount > 0 ? (adv_expenses / ordered_amount) * 100 : 0,
      percent_adv_drr: adv_revenue > 0 ? (adv_expenses / adv_revenue) * 100 : 0,
      adv_cpc: adv_clicks > 0 ? adv_expenses / adv_clicks : 0,
      adv_cpo: adv_revenue > 0 ? adv_expenses / (adv_revenue || 1) : 0,  // CPO реклам
      session_view: sum("session_view"),
      percent_session_to_pdp: rr[0]?.percent_session_to_pdp ?? 0,
      percent_pdp_to_cart: rr[0]?.percent_pdp_to_cart ?? 0,
      percent_cart_to_order: rr[0]?.percent_cart_to_order ?? 0,
      percent_order_to_buy: rr[0]?.percent_order_to_buy ?? 0,
      fbo_stocks,
      fbs_stocks,
      turnover_days,
      available_in_days,
      profit,
      profit_unit,
      margin_percent,
      roi_percent,
      ros_percent,
      cost_price_total,
    };
  });
}
```

**Step 2: Hook**

```typescript
// src/hooks/useOzonAnalytics.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aggregateToProductMetrics } from "@/lib/analytics-calculations";

export function useOzonAnalytics(marketplaceId: string, dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["ozon-analytics", marketplaceId, dateFrom, dateTo],
    enabled: !!marketplaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ozon_analytics_daily")
        .select(`
          offer_id, date, ordered_cnt, ordered_amount, bought_cnt, bought_amount,
          returned_cnt, cancelled_cnt, adv_views, adv_clicks, adv_expenses, adv_revenue,
          session_view, percent_session_to_pdp, percent_pdp_to_cart,
          percent_cart_to_order, percent_order_to_buy, percent_ctr, percent_drr,
          adv_cpc, adv_cpo
        `)
        .eq("marketplace_id", marketplaceId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true });

      if (error) throw error;

      // Join with stocks
      const { data: stocks } = await supabase
        .from("ozon_stocks_daily")
        .select("offer_id, date, fbo_stocks, fbs_stocks")
        .eq("marketplace_id", marketplaceId)
        .lte("date", dateTo)
        .order("date", { ascending: false });

      // Join with cost prices
      const { data: costs } = await supabase
        .from("product_cost_prices")
        .select("offer_id, cost_price")
        .eq("marketplace_id", marketplaceId)
        .lte("valid_from", dateTo);

      // Merge stocks into analytics rows
      const stockMap = new Map(stocks?.map(s => [`${s.offer_id}_${s.date}`, s]) || []);
      const costMap = new Map(costs?.map(c => [c.offer_id, c.cost_price]) || []);

      const enriched = (data || []).map(row => ({
        ...row,
        fbo_stocks: stockMap.get(`${row.offer_id}_${row.date}`)?.fbo_stocks,
        fbs_stocks: stockMap.get(`${row.offer_id}_${row.date}`)?.fbs_stocks,
        cost_price: costMap.get(row.offer_id),
      }));

      return aggregateToProductMetrics(enriched as any);
    },
  });
}
```

**Step 3: Commit**
```bash
git add src/hooks/useOzonAnalytics.ts src/lib/analytics-calculations.ts
git commit -m "feat: analytics calculations library and useOzonAnalytics hook"
```

---

## PHASE 2 — Analytics UI

### Task 4: Analytics page layout + date controls

**Files:**
- Create: `src/pages/OzonAnalytics.tsx`
- Create: `src/components/analytics/DateRangeControl.tsx`
- Create: `src/components/analytics/MetricTooltip.tsx`

**Step 1: DateRangeControl with presets**

```tsx
// src/components/analytics/DateRangeControl.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

const PRESETS = [
  { label: "Сегодня", days: 0 },
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
];

export function DateRangeControl({ onChange }: { onChange: (from: string, to: string) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [active, setActive] = useState(30);

  const handlePreset = (days: number) => {
    setActive(days);
    const from = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
    onChange(from, today);
  };

  return (
    <div className="flex items-center gap-2">
      {PRESETS.map(p => (
        <Button
          key={p.days}
          variant={active === p.days ? "default" : "outline"}
          size="sm"
          onClick={() => handlePreset(p.days)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
```

**Step 2: MetricTooltip — formula + benchmark info**

```tsx
// src/components/analytics/MetricTooltip.tsx
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricTooltipProps {
  label: string;
  formula?: string;
  benchmark?: string;
}

export function MetricTooltip({ label, formula, benchmark }: MetricTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help">
          <span>{label}</span>
          <Info className="w-3 h-3 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1">
        {formula && <p className="text-xs text-muted-foreground font-mono">{formula}</p>}
        {benchmark && <p className="text-xs text-green-600">{benchmark}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
```

**Step 3: OzonAnalytics main page (skeleton)**

```tsx
// src/pages/OzonAnalytics.tsx
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangeControl } from "@/components/analytics/DateRangeControl";
import { useOzonAnalytics } from "@/hooks/useOzonAnalytics";
// (KPI cards, table, charts imported in subsequent tasks)

export default function OzonAnalytics() {
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 30*86400000).toISOString().split("T")[0]
  );
  const [dateTo, setDateTo] = useState(today);
  const marketplaceId = ""; // from context

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Аналитика Ozon</h1>
          <DateRangeControl onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        </div>

        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Товары</TabsTrigger>
            <TabsTrigger value="funnel">Воронка</TabsTrigger>
            <TabsTrigger value="ads">Реклама</TabsTrigger>
            <TabsTrigger value="stocks">Остатки</TabsTrigger>
            <TabsTrigger value="charts">Графики</TabsTrigger>
          </TabsList>
          {/* TabsContent populated in next tasks */}
        </Tabs>
      </div>
    </div>
  );
}
```

**Step 4: Add route to App.tsx**

In `src/App.tsx`, add:
```tsx
<Route path="/ozon-analytics" element={<OzonAnalytics />} />
```

And in navigation sidebar, add link to `/ozon-analytics`.

**Step 5: Commit**
```bash
git add src/pages/OzonAnalytics.tsx src/components/analytics/DateRangeControl.tsx src/components/analytics/MetricTooltip.tsx
git commit -m "feat: OzonAnalytics page skeleton with date controls and metric tooltips"
```

---

### Task 5: KPI summary cards

**Files:**
- Create: `src/components/analytics/OzonKpiCards.tsx`

**Design:** 3×2 grid of cards. Each card: metric name, big value, trend vs previous period, color indicator.

**Key metrics to show:**
- Заказано (шт / руб)
- Выкуплено (шт / руб)
- Прибыль (руб)
- ДРР %
- CTR %
- Оборачиваемость (дни)

```tsx
// src/components/analytics/OzonKpiCards.tsx
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MetricTooltip } from "./MetricTooltip";
import type { ProductMetrics } from "@/lib/analytics-calculations";

interface KpiCardsProps {
  data: ProductMetrics[];
  isLoading: boolean;
}

const METRICS_CONFIG = [
  { key: "ordered_cnt", label: "Заказано", unit: "шт", format: "int",
    formula: "Количество заказов за период", good_direction: "up" },
  { key: "ordered_amount", label: "Сумма заказов", unit: "₽", format: "money",
    formula: "Сумма оформленных заказов", good_direction: "up" },
  { key: "profit", label: "Прибыль", unit: "₽", format: "money",
    formula: "Выкупы − комиссии − расходы − себестоимость", good_direction: "up" },
  { key: "percent_drr", label: "ДРР", unit: "%", format: "percent",
    formula: "adv_expenses / ordered_amount × 100", benchmark: "Хорошо < 10%", good_direction: "down" },
  { key: "percent_ctr", label: "CTR рекламы", unit: "%", format: "percent",
    formula: "adv_clicks / adv_views × 100", benchmark: "Хорошо > 2%", good_direction: "up" },
  { key: "turnover_days", label: "Оборачиваемость", unit: "дн", format: "int",
    formula: "(FBO + FBS) / avg_week_ordered × 7", benchmark: "Норма: 30−60 дней", good_direction: "neutral" },
];

export function OzonKpiCards({ data, isLoading }: KpiCardsProps) {
  if (isLoading) return <div className="grid grid-cols-3 gap-4">{[...Array(6)].map((_, i) => (
    <Card key={i}><CardContent className="p-4 h-24 animate-pulse bg-muted" /></Card>
  ))}</div>;

  // Aggregate totals
  const totals = data.reduce((acc, row) => {
    for (const m of METRICS_CONFIG) {
      acc[m.key] = (acc[m.key] || 0) + (row[m.key as keyof ProductMetrics] as number || 0);
    }
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {METRICS_CONFIG.map(m => (
        <Card key={m.key} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 space-y-1">
            <MetricTooltip label={m.label} formula={m.formula} benchmark={m.benchmark} />
            <div className="text-2xl font-bold">
              {m.format === "money"
                ? `${(totals[m.key] || 0).toLocaleString("ru-RU")} ₽`
                : m.format === "percent"
                ? `${(totals[m.key] || 0).toFixed(1)}%`
                : `${Math.round(totals[m.key] || 0)} ${m.unit}`}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Step 2: Wire into OzonAnalytics.tsx tabs**

**Step 3: Commit**
```bash
git add src/components/analytics/OzonKpiCards.tsx
git commit -m "feat: OzonKpiCards with metric tooltips and aggregated totals"
```

---

### Task 6: Products analytics table (with column groups)

**Files:**
- Create: `src/components/analytics/OzonProductsTable.tsx`

**UX Key decisions:**
- Column groups as toggleable sections (not all 103 columns visible at once)
- Sticky first column (product name)
- Color coding: green/yellow/red based on thresholds
- Sortable columns
- Search/filter by product name
- Export to CSV button

**Column groups:**
1. **Продажи** (ordered_cnt, bought_cnt, ordered_amount, bought_amount, returned_cnt, percent_cancellations_and_returns)
2. **Реклама** (adv_views, adv_clicks, percent_ctr, adv_expenses, percent_drr, adv_cpc, adv_cpo)
3. **Воронка** (session_view, percent_session_to_pdp, percent_pdp_to_cart, percent_cart_to_order, percent_order_to_buy)
4. **Остатки** (fbo_stocks, fbs_stocks, turnover_days, available_in_days)
5. **Доходность** (profit, profit_unit, margin_percent, roi_percent, ros_percent)

```tsx
// Key structure of OzonProductsTable.tsx
const COLUMN_GROUPS = {
  sales: { label: "Продажи", defaultVisible: true, columns: [...] },
  ads: { label: "Реклама", defaultVisible: true, columns: [...] },
  funnel: { label: "Воронка", defaultVisible: false, columns: [...] },
  stocks: { label: "Остатки", defaultVisible: true, columns: [...] },
  profitability: { label: "Доходность", defaultVisible: false, columns: [...] },
};

// Column toggle toolbar above table
// <div className="flex gap-2">
//   {Object.entries(COLUMN_GROUPS).map(([key, group]) => (
//     <Toggle key={key} pressed={visible[key]} onPressedChange={toggle(key)}>
//       {group.label}
//     </Toggle>
//   ))}
// </div>
```

Full implementation of this component (150-200 lines with all columns, sorting, color coding, CSV export).

**Step 2: Commit**
```bash
git add src/components/analytics/OzonProductsTable.tsx
git commit -m "feat: OzonProductsTable with column groups, sorting, and color thresholds"
```

---

### Task 7: Sales trend charts (Recharts)

**Files:**
- Create: `src/components/analytics/SalesTrendChart.tsx`
- Modify: `package.json` — add recharts if not already present

**Check if recharts installed:**
```bash
grep recharts package.json
```
If not: `npm install recharts`

**Chart: daily ordered_amount + bought_amount + adv_expenses as area/line chart**

```tsx
// src/components/analytics/SalesTrendChart.tsx
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// dailyData: { date, ordered_amount, bought_amount, adv_expenses }[]
export function SalesTrendChart({ dailyData }: { dailyData: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={dailyData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={d => d.slice(5)} />
        <YAxis />
        <Tooltip formatter={(v: number) => `${v.toLocaleString("ru-RU")} ₽`} />
        <Legend />
        <Area type="monotone" dataKey="ordered_amount" name="Заказано" fill="#6366f1" stroke="#6366f1" fillOpacity={0.3} />
        <Area type="monotone" dataKey="bought_amount" name="Выкуплено" fill="#22c55e" stroke="#22c55e" fillOpacity={0.3} />
        <Area type="monotone" dataKey="adv_expenses" name="Реклама" fill="#f59e0b" stroke="#f59e0b" fillOpacity={0.3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

**Also add: FunnelChart using recharts FunnelChart for conversion visualization**

**Step 2: Wire charts into the "Графики" tab**

**Step 3: Commit**
```bash
git add src/components/analytics/SalesTrendChart.tsx
git commit -m "feat: sales trend and funnel charts using Recharts"
```

---

### Task 8: Navigation and route registration

**Files:**
- Modify: `src/App.tsx` — add routes
- Modify: `src/components/AppLayout.tsx` — add nav links

**Add to sidebar nav:**
- "Аналитика Ozon" → `/ozon-analytics` (BarChart3 icon)
- "Закупка" → `/procurement` (Truck icon)

**Step 2: Commit**
```bash
git add src/App.tsx src/components/AppLayout.tsx
git commit -m "feat: register OzonAnalytics and Procurement routes in navigation"
```

---

## PHASE 3 — Procurement/Distribution Module

### Task 9: Procurement database tables

**Files:**
- Create: `supabase/migrations/20260320000002_create_procurement_tables.sql`

```sql
-- Кластера
CREATE TABLE IF NOT EXISTS public.clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Категории селлера (коэффициенты)
CREATE TABLE IF NOT EXISTS public.seller_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  coverage_coef NUMERIC(10,4) NOT NULL DEFAULT 1.0,  -- коэффициент обеспеченности
  distribution_coef NUMERIC(10,4) NOT NULL DEFAULT 1.0,  -- коэффициент распределения
  description TEXT,
  is_novelty BOOLEAN DEFAULT false,
  UNIQUE(marketplace_id, code)
);

-- Привязка категории Ozon к доле по кластерам
CREATE TABLE IF NOT EXISTS public.ozon_category_cluster_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  description_category_id BIGINT NOT NULL,
  ozon_category_name TEXT,
  cluster_id UUID REFERENCES public.clusters(id),
  distribution_share NUMERIC(10,6) NOT NULL,  -- доля от 0 до 1
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, description_category_id, cluster_id)
);

-- Данные по бизнес-характеристикам товара
CREATE TABLE IF NOT EXISTS public.product_business_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  seller_category_code TEXT,
  supplier_id UUID,
  lead_time_days INTEGER DEFAULT 14,
  small_box_quantity INTEGER,
  large_box_quantity INTEGER,
  UNIQUE(marketplace_id, offer_id)
);

-- Поставщики
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lead_time_days INTEGER DEFAULT 14,
  contact TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Планы продаж
CREATE TABLE IF NOT EXISTS public.sales_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  plan_month DATE NOT NULL,  -- first day of month
  plan_qty INTEGER NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_id, offer_id, plan_month)
);

-- Ручной товар в пути
CREATE TABLE IF NOT EXISTS public.manual_in_transit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  cluster_id UUID REFERENCES public.clusters(id),
  qty INTEGER NOT NULL,
  ship_date DATE,
  status TEXT DEFAULT 'open',  -- open / suspected_matched / closed
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Сессии распределения
CREATE TABLE IF NOT EXISTS public.allocation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  working_date DATE NOT NULL,
  status TEXT DEFAULT 'draft',  -- draft / active / closed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Версии распределения
CREATE TABLE IF NOT EXISTS public.allocation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.allocation_sessions(id),
  version_no INTEGER NOT NULL,
  version_type TEXT DEFAULT 'BASE',  -- BASE / ADDON
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Заказы на кластер
CREATE TABLE IF NOT EXISTS public.shipment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES public.allocation_versions(id),
  cluster_id UUID REFERENCES public.clusters(id),
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Строки заказа
CREATE TABLE IF NOT EXISTS public.shipment_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.shipment_orders(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL,
  cluster_norm NUMERIC(10,2),
  cluster_need NUMERIC(10,2),
  qty_to_ship INTEGER NOT NULL DEFAULT 0,
  manual_override INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Составы комплектов
CREATE TABLE IF NOT EXISTS public.product_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  parent_offer_id TEXT NOT NULL,
  component_offer_id TEXT NOT NULL,
  component_qty INTEGER NOT NULL DEFAULT 1,
  UNIQUE(marketplace_id, parent_offer_id, component_offer_id)
);

-- RLS на все таблицы (повторить паттерн)
```

**Step 2: Apply and commit**
```bash
supabase db push
git add supabase/migrations/20260320000002_create_procurement_tables.sql
git commit -m "feat: add procurement module database tables"
```

---

### Task 10: Procurement calculation engine (TypeScript)

**Files:**
- Create: `src/lib/procurement-calculations.ts`

**Implements all formulas from TZ:**

```typescript
// src/lib/procurement-calculations.ts

export interface AllocationRow {
  offer_id: string;
  product_name?: string;
  plan_qty: number;           // monthly plan
  seller_category_code: string;
  coverage_coef: number;      // КФ обеспеченности
  distribution_coef: number;  // КФ распределения
  lead_time_days: number;
  small_box_qty?: number;
  large_box_qty?: number;
  fbo_stocks: number;         // текущий остаток
  fbs_stocks: number;
  central_stock: number;      // остаток на ЦС
}

export interface ClusterDistribution {
  cluster_id: string;
  cluster_name: string;
  cluster_short: string;
  distribution_share: number; // от 0 до 1
}

export interface ClusterNeed {
  cluster_id: string;
  cluster_name: string;
  cluster_short: string;
  cluster_norm: number;        // норма остатка
  current_stock: number;       // текущий остаток
  in_transit: number;          // товар в пути
  cluster_need_raw: number;    // потребность до кратности
  cluster_need_final: number;  // потребность с учетом кратности
}

export interface AllocationResult {
  offer_id: string;
  clusters: ClusterNeed[];
  total_to_distribute: number;
  central_stock_after: number;
  central_norm: number;
  supplier_need: number;
}

/** Норма остатка на кластере */
export function calcClusterNorm(plan_qty: number, share: number): number {
  return plan_qty * share;
}

/** Потребность на кластер */
export function calcClusterNeed(
  cluster_norm: number,
  distribution_coef: number,
  current_stock: number,
  in_transit: number
): number {
  const raw = cluster_norm * distribution_coef - current_stock - in_transit;
  return Math.max(0, raw);
}

/** Кратность упаковки */
export function applyPackagingRounding(need: number, box_qty?: number): number {
  if (!box_qty || box_qty <= 0) return Math.ceil(need);
  const ratio = need / box_qty;
  if (ratio < 0.5) return 0;
  return Math.round(ratio) * box_qty;
}

/** Норма остатка ЦС */
export function calcCentralNorm(plan_qty: number, coverage_coef: number, lead_time_days: number): number {
  return plan_qty * coverage_coef + plan_qty * (lead_time_days / 30);
}

/** К заказу поставщику */
export function calcSupplierNeed(central_norm: number, stock_after_allocation: number): number {
  return Math.max(0, central_norm - stock_after_allocation);
}

/** Полный расчет для одного товара */
export function calcAllocation(
  row: AllocationRow,
  distributions: ClusterDistribution[],
  inTransitByCluster: Map<string, number>,
  stocksByCluster: Map<string, number>
): AllocationResult {
  const plan_day = row.plan_qty / 30; // в день
  const plan_week = plan_day * 7;

  const box_qty = row.small_box_qty || row.large_box_qty;

  const clusters: ClusterNeed[] = distributions.map(d => {
    const cluster_norm = calcClusterNorm(row.plan_qty, d.distribution_share);
    const current_stock = stocksByCluster.get(d.cluster_id) || 0;
    const in_transit = inTransitByCluster.get(d.cluster_id) || 0;
    const raw_need = calcClusterNeed(cluster_norm, row.distribution_coef, current_stock, in_transit);
    const final_need = applyPackagingRounding(raw_need, box_qty);

    return {
      cluster_id: d.cluster_id,
      cluster_name: d.cluster_name,
      cluster_short: d.cluster_short,
      cluster_norm,
      current_stock,
      in_transit,
      cluster_need_raw: raw_need,
      cluster_need_final: final_need,
    };
  });

  const total_to_distribute = clusters.reduce((s, c) => s + c.cluster_need_final, 0);
  const central_stock_after = row.central_stock - total_to_distribute;
  const central_norm = calcCentralNorm(row.plan_qty, row.coverage_coef, row.lead_time_days);
  const supplier_need = calcSupplierNeed(central_norm, central_stock_after);

  return { offer_id: row.offer_id, clusters, total_to_distribute, central_stock_after, central_norm, supplier_need };
}
```

**Step 2: Commit**
```bash
git add src/lib/procurement-calculations.ts
git commit -m "feat: procurement calculation engine with all TZ formulas"
```

---

### Task 11: Procurement UI — main page + tables

**Files:**
- Create: `src/pages/Procurement.tsx`
- Create: `src/components/procurement/AllocationTable.tsx`
- Create: `src/components/procurement/ClusterGrid.tsx`
- Create: `src/components/procurement/SalesPlanUpload.tsx`

**UX Design for Procurement:**

```
┌─────────────────────────────────────────────────────────┐
│ Закупка и Распределение          [Новая сессия]          │
│ Дата: 20.03.2026   Версия: BASE #1   [Статус: черновик] │
├─────────────────────────────────────────────────────────┤
│ [Загрузить план] [Загрузить остатки ЦС] [Рассчитать]    │
├─────────────────────────────────────────────────────────┤
│ Товар    | Кластер 1 | Кластер 2 | ... | К постав-у     │
│          | Норма/Факт| Норма/Факт|     | Норма/Заказ    │
│ Товар А  |  10 / 12 |  5 / 3    | ... | 100 / 87       │
│ Товар Б  |   8 / 0  |  4 / 8    | ... | 50 / 50        │
└─────────────────────────────────────────────────────────┘
```

Key UX improvements:
- **Dual-row cells**: norm (gray) / actual need (colored) — not two columns
- **Color coding**: green = sufficient, yellow = partial, red = zero stock
- **Inline manual override**: click cell to enter manual qty
- **Frozen product column + frozen cluster columns that fit screen** (no 16-cluster full scroll)
- **Cluster groups by priority**
- **"Как посчиталось"**: expandable row showing formula breakdown
- **Pick list export** as printable view

**Step 2: SalesPlanUpload component**
- Accepts Excel/CSV with columns: offer_id, plan_qty, month
- Parses and upserts into `sales_plan` table

**Step 3: CentralStockUpload**
- Accepts simple CSV: offer_id, qty
- Updates `central_stock` column in product_business_data

**Step 4: Commit**
```bash
git add src/pages/Procurement.tsx src/components/procurement/
git commit -m "feat: Procurement page with allocation table and data upload"
```

---

### Task 12: Supplier orders + pick list view

**Files:**
- Create: `src/components/procurement/SupplierOrderSummary.tsx`
- Create: `src/components/procurement/PickListView.tsx`

**SupplierOrderSummary:**
- Groups by supplier
- Shows: offer_id, product_name, к_заказу, current_central_stock, central_norm
- Export to Excel (using SheetJS if needed)
- Supports BOM expansion: кит → разворот в компоненты

**PickListView:**
- Groups by cluster
- Shows: offer_id, product_name, qty_to_ship, location (if available)
- Print-friendly CSS
- BASE version only shows new items vs ADDON version

**Step 2: Commit**
```bash
git add src/components/procurement/SupplierOrderSummary.tsx src/components/procurement/PickListView.tsx
git commit -m "feat: supplier order summary and pick list print view"
```

---

## PHASE 4 — Polishing & Reference Data

### Task 13: Reference data management screens

**Files:**
- Create: `src/pages/ProcurementSettings.tsx`
- Create: `src/components/procurement/ClustersTable.tsx`
- Create: `src/components/procurement/SellerCategoriesTable.tsx`
- Create: `src/components/procurement/CategoryDistributionUpload.tsx`

**ClustersTable:** CRUD for clusters (name, short_name, priority, is_active)

**SellerCategoriesTable:** CRUD for categories with coefficients:
```
| Код | Название | КФ обеспеченности | КФ распределения | Новинка |
|  1  | Быстрые  |       1.5         |       1.2        |   нет   |
|  5  | Новинки  |       2.0         |       0.8        |   да    |
```

**CategoryDistributionUpload:**
- Upload Excel with: category_name, cluster_1_share, cluster_2_share, ..., cluster_16_share
- Validates shares sum to 1.0
- Upserts into ozon_category_cluster_distribution

**Step 2: Commit**
```bash
git add src/pages/ProcurementSettings.tsx src/components/procurement/
git commit -m "feat: reference data management UI for clusters, categories, distributions"
```

---

### Task 14: Manual in-transit management

**Files:**
- Create: `src/components/procurement/InTransitTable.tsx`

**UX:** Table with inline add/edit, status toggle, comment field.
Statuses shown as colored badges: open (blue) / suspected (yellow) / closed (gray).

---

### Task 15: Allocation exceptions journal + "Как посчиталось"

**Files:**
- Create: `src/components/procurement/ExceptionsLog.tsx`
- Create: `src/components/procurement/HowCalculated.tsx`

**ExceptionsLog:** Любые аномалии при расчёте (отрицательная потребность, нет плана, нет долей) → журнал с причиной.

**HowCalculated:** Expandable panel per row showing step-by-step:
```
Норма кластера = план (100 шт) × доля кластера (0.15) = 15 шт
Потребность = норма (15) × КФ распределения (1.2) − остаток (5) − в пути (2) = 11 шт
Кратность: 11 / 6 = 1.83 → округление → 2 × 6 = 12 шт
```

---

## Implementation Order Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1–3 | Data layer: tables + edge functions + TS hook |
| 2 | 4–8 | Analytics UI: KPI cards + table + charts + routing |
| 3 | 9–12 | Procurement: DB + calculations + UI + pick lists |
| 4 | 13–15 | Polish: reference data, in-transit, exceptions |

**Start with Phase 1 first** — no UI is possible without data.
**Critical path for analytics:** Task 1 → Task 2 (run sync manually to populate data) → Task 3 → Task 4-7
**Can parallelize:** Phase 3 (procurement) can start after Task 1 (migrations) since it needs its own tables

---

## What NOT to touch

- `src/pages/analytics/` — existing review/question analytics (separate concern)
- `supabase/functions/sync-reviews*`, `sync-chats*`, `sync-questions*` — don't touch
- `src/pages/Reviews.tsx`, `Chats.tsx`, `Questions.tsx` — leave as-is
- `src/lib/sales-calculations.ts` — the existing accruals-based calculations stay for the "Аналитика Продаж" page

---

## Notes on Data Availability

**Ozon API `/v1/analytics/data`**: Returns data for past 90 days (premium) or 30 days (standard). Need to run sync-ozon-analytics to populate historical data on first run.

**Stocks**: Ozon `/v2/analytics/stock_on_warehouses` returns current snapshot. Historical stocks will only exist from the day we start syncing.

**Until data arrives**: UI should show "Нет данных — запустите синхронизацию" with a sync button that calls the Edge Function manually.
