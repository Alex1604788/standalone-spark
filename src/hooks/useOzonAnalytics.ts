import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  aggregateToProductMetrics,
  computeTotals,
  buildDailyTimeseries,
  type ProductMetrics,
  type TotalSummary,
  type DailyPoint,
} from "@/lib/analytics-calculations";

interface UseOzonAnalyticsOptions {
  marketplaceId: string;
  dateFrom: string;
  dateTo: string;
}

interface OzonAnalyticsResult {
  products: ProductMetrics[];
  totals: TotalSummary;
  daily: DailyPoint[];
}

export function useOzonAnalytics({
  marketplaceId,
  dateFrom,
  dateTo,
}: UseOzonAnalyticsOptions) {
  return useQuery<OzonAnalyticsResult>({
    queryKey: ["ozon-analytics", marketplaceId, dateFrom, dateTo],
    enabled: !!marketplaceId && !!dateFrom && !!dateTo,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // 1. Аналитика за период
      const { data: analyticsData, error: analyticsError } = await supabase
        .from("ozon_analytics_daily")
        .select(
          `offer_id, product_name, date,
           ordered_units, revenue, cancellations, returns,
           bought_in_ozon_orders,
           session_view, session_view_pdp, hits_view,
           conv_tocart_pdp`
        )
        .eq("marketplace_id", marketplaceId)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      if (analyticsError) throw analyticsError;

      // 2. Остатки — берём последний снимок за 30 дней до dateTo
      const stocksWindowFrom = new Date(dateTo);
      stocksWindowFrom.setDate(stocksWindowFrom.getDate() - 30);
      const stocksFrom = stocksWindowFrom.toISOString().split("T")[0];

      const { data: stocksData } = await supabase
        .from("ozon_stocks_daily")
        .select("offer_id, date, fbo_stocks, fbs_stocks")
        .eq("marketplace_id", marketplaceId)
        .lte("date", dateTo)
        .gte("date", stocksFrom)
        .order("date", { ascending: false });

      // 3. Себестоимость из product_business_data
      const { data: costsData } = await supabase
        .from("product_business_data")
        .select("offer_id, purchase_price")
        .eq("marketplace_id", marketplaceId)
        .not("purchase_price", "is", null);

      // 4. Финансовые данные: комиссия, логистика, эквайринг
      //    Данные по offer_id суммируем за весь период, прокинем на агрегатор
      const { data: financeData } = await supabase
        .from("ozon_finance_daily")
        .select(
          "offer_id, commission, logistics_to_customer, logistics_return, acquiring, other_expenses"
        )
        .eq("marketplace_id", marketplaceId)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      // 5. Расходы на рекламу: money_spent из ozon_performance_daily по offer_id
      //    offer_id в таблице заполнен не всегда — берём только заполненные
      const { data: advData } = await supabase
        .from("ozon_performance_daily")
        .select("offer_id, stat_date, money_spent")
        .eq("marketplace_id", marketplaceId)
        .gte("stat_date", dateFrom)
        .lte("stat_date", dateTo)
        .not("offer_id", "is", null);

      // ── Маппинги ─────────────────────────────────────────────

      // Остатки: offer_id → последняя запись
      const stocksMap = new Map<string, { fbo_stocks: number; fbs_stocks: number; date: string }>();
      for (const s of stocksData || []) {
        const existing = stocksMap.get(s.offer_id);
        if (!existing || s.date > existing.date) {
          stocksMap.set(s.offer_id, {
            fbo_stocks: s.fbo_stocks ?? 0,
            fbs_stocks: s.fbs_stocks ?? 0,
            date: s.date,
          });
        }
      }

      // Себестоимость
      const costsMap = new Map<string, number>();
      for (const c of costsData || []) {
        if (c.purchase_price) costsMap.set(c.offer_id, c.purchase_price);
      }

      // Финансы: суммируем по offer_id за весь период
      const financeMap = new Map<string, {
        commission: number;
        logistics_to_customer: number;
        logistics_return: number;
        acquiring: number;
        other_expenses: number;
      }>();
      for (const f of financeData || []) {
        const ex = financeMap.get(f.offer_id) ?? {
          commission: 0, logistics_to_customer: 0,
          logistics_return: 0, acquiring: 0, other_expenses: 0,
        };
        ex.commission            += Number(f.commission            ?? 0);
        ex.logistics_to_customer += Number(f.logistics_to_customer ?? 0);
        ex.logistics_return      += Number(f.logistics_return      ?? 0);
        ex.acquiring             += Number(f.acquiring             ?? 0);
        ex.other_expenses        += Number(f.other_expenses        ?? 0);
        financeMap.set(f.offer_id, ex);
      }

      // Реклама: суммируем money_spent по offer_id
      // Дедупликация: money_spent в таблице уже привязан к конкретному offer_id (строка = sku/offer_id × день × кампания)
      const advMap = new Map<string, number>();
      for (const a of advData || []) {
        if (!a.offer_id) continue;
        advMap.set(a.offer_id, (advMap.get(a.offer_id) ?? 0) + Number(a.money_spent ?? 0));
      }

      // ── Обогащаем строки аналитики ────────────────────────────
      const enriched = (analyticsData || []).map((row) => {
        const fin = financeMap.get(row.offer_id);
        return {
          ...row,
          fbo_stocks:            stocksMap.get(row.offer_id)?.fbo_stocks ?? null,
          fbs_stocks:            stocksMap.get(row.offer_id)?.fbs_stocks ?? null,
          cost_price:            costsMap.get(row.offer_id) ?? null,
          // Финансовые компоненты (за весь период — агрегатор берёт с первой строки)
          commission:            fin?.commission            ?? null,
          logistics_to_customer: fin?.logistics_to_customer ?? null,
          logistics_return:      fin?.logistics_return      ?? null,
          acquiring:             fin?.acquiring             ?? null,
          other_expenses:        fin?.other_expenses        ?? null,
          adv_expenses:          advMap.get(row.offer_id)   ?? null,
        };
      });

      const products = aggregateToProductMetrics(enriched);
      const totals   = computeTotals(products);
      const daily    = buildDailyTimeseries(products);

      return { products, totals, daily };
    },
  });
}

export function useSyncOzonAnalytics() {
  const sync = async (options?: { days?: number; dateFrom?: string; dateTo?: string }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    return supabase.functions.invoke("sync-ozon-analytics", {
      body: options || { days: 2 },
    });
  };

  const syncStocks = async () =>
    supabase.functions.invoke("sync-ozon-stocks", { body: {} });

  const syncFinance = async (days = 7) =>
    supabase.functions.invoke("sync-ozon-finance", { body: { days } });

  return { sync, syncStocks, syncFinance };
}
