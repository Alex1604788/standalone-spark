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
    staleTime: 5 * 60 * 1000, // 5 минут кеш
    queryFn: async () => {
      // 1. Загружаем аналитику за период
      const { data: analyticsData, error: analyticsError } = await supabase
        .from("ozon_analytics_daily")
        .select(
          `offer_id, date,
           session_view, percent_session_to_pdp, percent_pdp_to_cart,
           percent_cart_to_order, percent_order_to_buy, percent_pdp_to_order,
           ordered_cnt, ordered_amount, bought_cnt, bought_amount,
           returned_cnt, cancelled_cnt,
           adv_views, adv_clicks, adv_carts, adv_orders,
           adv_revenue, adv_expenses, adv_cpc, adv_cpm, adv_cpcart,
           adv_cpo, adv_cpo_general, percent_ctr, percent_drr, percent_adv_drr,
           price_seller, price_ozon, price_index, content_rating,
           bought_commission, bought_expense, returned_amount,
           returned_commission, returned_expense, acquiring, marketplace_expenses`
        )
        .eq("marketplace_id", marketplaceId)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      if (analyticsError) throw analyticsError;

      // 2. Загружаем остатки (последний снимок за период)
      const { data: stocksData } = await supabase
        .from("ozon_stocks_daily")
        .select("offer_id, date, fbo_stocks, fbs_stocks")
        .eq("marketplace_id", marketplaceId)
        .lte("date", dateTo)
        .gte("date", dateFrom);

      // 3. Загружаем себестоимость
      const { data: costsData } = await supabase
        .from("product_cost_prices")
        .select("offer_id, cost_price, valid_from, valid_to")
        .eq("marketplace_id", marketplaceId)
        .lte("valid_from", dateTo);

      // 4. Загружаем информацию о товарах (название, категория, sku)
      const { data: productsData } = await supabase
        .from("products")
        .select("offer_id, name, sku, category")
        .eq("marketplace_id", marketplaceId);

      // Строим Map для быстрого lookup
      // Остатки: берём ближайшую запись к dateTo для каждого offer_id
      const stocksMap = new Map<string, { fbo_stocks: number; fbs_stocks: number }>();
      for (const s of (stocksData || [])) {
        const existing = stocksMap.get(s.offer_id);
        if (!existing || s.date > (existing as { date?: string }).date) {
          stocksMap.set(s.offer_id, { fbo_stocks: s.fbo_stocks ?? 0, fbs_stocks: s.fbs_stocks ?? 0 });
        }
      }

      // Себестоимость: берём актуальную на дату
      const costsMap = new Map<string, number>();
      for (const c of (costsData || [])) {
        if (!c.valid_to || c.valid_to >= dateFrom) {
          costsMap.set(c.offer_id, c.cost_price);
        }
      }

      // Товары: Map offer_id → info
      const productsMap = new Map(
        (productsData || []).map((p) => [
          p.offer_id,
          { name: p.name, category: p.category, sku: p.sku },
        ])
      );

      // 5. Обогащаем строки аналитики
      const enriched = (analyticsData || []).map((row) => ({
        ...row,
        fbo_stocks: stocksMap.get(row.offer_id)?.fbo_stocks ?? null,
        fbs_stocks: stocksMap.get(row.offer_id)?.fbs_stocks ?? null,
        cost_price: costsMap.get(row.offer_id) ?? null,
      }));

      // 6. Агрегируем
      const products = aggregateToProductMetrics(enriched as Parameters<typeof aggregateToProductMetrics>[0], productsMap);
      const totals = computeTotals(products);
      const daily = buildDailyTimeseries(products);

      return { products, totals, daily };
    },
  });
}

// Хук для ручного запуска синхронизации
export function useSyncOzonAnalytics() {
  const sync = async (options?: { days?: number; dateFrom?: string; dateTo?: string }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const resp = await supabase.functions.invoke("sync-ozon-analytics", {
      body: options || { days: 2 },
    });

    return resp;
  };

  const syncStocks = async () => {
    const resp = await supabase.functions.invoke("sync-ozon-stocks", {
      body: {},
    });
    return resp;
  };

  return { sync, syncStocks };
}
