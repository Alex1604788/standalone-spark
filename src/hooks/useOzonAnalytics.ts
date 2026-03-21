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
      // 1. Аналитика за период (новые колонки)
      const { data: analyticsData, error: analyticsError } = await supabase
        .from("ozon_analytics_daily")
        .select(
          `offer_id, product_name, date,
           ordered_units, revenue, cancellations, returns,
           bought_in_ozon_orders,
           session_view, session_view_pdp, hits_view,
           conv_tocart_pdp, conv_topurchase_pdp`
        )
        .eq("marketplace_id", marketplaceId)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      if (analyticsError) throw analyticsError;

      // 2. Остатки (ближайшие к dateTo)
      const { data: stocksData } = await supabase
        .from("ozon_stocks_daily")
        .select("offer_id, sku, date, fbo_stocks, fbs_stocks")
        .eq("marketplace_id", marketplaceId)
        .lte("date", dateTo)
        .gte("date", dateFrom)
        .order("date", { ascending: false });

      // 3. Себестоимость
      const { data: costsData } = await supabase
        .from("product_cost_prices")
        .select("offer_id, cost_price, valid_from, valid_to")
        .eq("marketplace_id", marketplaceId)
        .lte("valid_from", dateTo);

      // Маппинг остатков: offer_id → последняя запись
      const stocksMap = new Map<string, { fbo_stocks: number; fbs_stocks: number; date: string }>();
      for (const s of (stocksData || [])) {
        const existing = stocksMap.get(s.offer_id);
        if (!existing || s.date > existing.date) {
          stocksMap.set(s.offer_id, {
            fbo_stocks: s.fbo_stocks ?? 0,
            fbs_stocks: s.fbs_stocks ?? 0,
            date: s.date,
          });
        }
      }

      // Себестоимость: актуальная на период
      const costsMap = new Map<string, number>();
      for (const c of (costsData || [])) {
        if (!c.valid_to || c.valid_to >= dateFrom) {
          costsMap.set(c.offer_id, c.cost_price);
        }
      }

      // Обогащаем строки аналитики
      const enriched = (analyticsData || []).map((row) => ({
        ...row,
        fbo_stocks: stocksMap.get(row.offer_id)?.fbo_stocks ?? null,
        fbs_stocks: stocksMap.get(row.offer_id)?.fbs_stocks ?? null,
        cost_price: costsMap.get(row.offer_id) ?? null,
      }));

      const products = aggregateToProductMetrics(enriched);
      const totals = computeTotals(products);
      const daily = buildDailyTimeseries(products);

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

  return { sync, syncStocks };
}
