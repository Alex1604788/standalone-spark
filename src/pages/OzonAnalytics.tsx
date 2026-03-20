import { useState } from "react";
import { RefreshCw, AlertCircle, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRangeControl } from "@/components/analytics/ozon/DateRangeControl";
import { KpiCards } from "@/components/analytics/ozon/KpiCards";
import { ProductsTable } from "@/components/analytics/ozon/ProductsTable";
import { SalesTrendChart } from "@/components/analytics/ozon/SalesTrendChart";
import { useOzonAnalytics, useSyncOzonAnalytics } from "@/hooks/useOzonAnalytics";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

export default function OzonAnalytics() {
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today);
  const queryClient = useQueryClient();

  // Получаем маркетплейс пользователя
  const { data: marketplace } = useQuery({
    queryKey: ["user-marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplaces")
        .select("id, name")
        .eq("is_active", true)
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const marketplaceId = marketplace?.id || "";

  // Аналитика
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useOzonAnalytics({ marketplaceId, dateFrom, dateTo });

  // Синхронизация
  const { sync, syncStocks } = useSyncOzonAnalytics();

  const syncMutation = useMutation({
    mutationFn: async () => {
      await sync({ dateFrom, dateTo });
      await syncStocks();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ozon-analytics"] });
    },
  });

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  };

  const hasData = (data?.products?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-4 md:p-6 space-y-5">

        {/* Заголовок */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Аналитика Ozon</h1>
              {marketplace?.name && (
                <p className="text-sm text-muted-foreground">{marketplace.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <DateRangeControl
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={handleDateChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !marketplaceId}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Синхронизирую..." : "Синхронизировать"}
            </Button>
          </div>
        </div>

        {/* Ошибка */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Ошибка загрузки данных. Попробуйте синхронизировать данные.
            </AlertDescription>
          </Alert>
        )}

        {/* Нет данных — подсказка */}
        {!isLoading && !hasData && !error && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Данных за период нет. Нажмите «Синхронизировать» чтобы загрузить данные из Ozon.
            </AlertDescription>
          </Alert>
        )}

        {/* KPI карточки */}
        <KpiCards totals={data?.totals ?? null} isLoading={isLoading} />

        {/* Вкладки */}
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList className="h-9">
            <TabsTrigger value="products" className="text-xs">Товары</TabsTrigger>
            <TabsTrigger value="charts" className="text-xs">Графики</TabsTrigger>
            <TabsTrigger value="funnel" className="text-xs">Воронка</TabsTrigger>
            <TabsTrigger value="ads" className="text-xs">Реклама</TabsTrigger>
          </TabsList>

          {/* Товары */}
          <TabsContent value="products" className="space-y-0 mt-0">
            <ProductsTable
              data={data?.products ?? []}
              isLoading={isLoading}
            />
          </TabsContent>

          {/* Графики */}
          <TabsContent value="charts" className="space-y-4">
            <SalesTrendChart
              data={data?.daily ?? []}
              isLoading={isLoading}
            />
          </TabsContent>

          {/* Воронка */}
          <TabsContent value="funnel" className="space-y-4">
            {!isLoading && hasData ? (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {[
                  { label: "Сессии", key: "session_view" as const, format: "number" },
                  { label: "В карточку", key: "percent_session_to_pdp" as const, format: "percent" },
                  { label: "В корзину", key: "percent_pdp_to_cart" as const, format: "percent" },
                  { label: "В заказ", key: "percent_cart_to_order" as const, format: "percent" },
                  { label: "Выкуп", key: "percent_order_to_buy" as const, format: "percent" },
                ].map((step) => {
                  const vals = (data?.products ?? [])
                    .map((p) => p[step.key] as number)
                    .filter((v) => v > 0);
                  const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
                  return (
                    <div
                      key={step.key}
                      className="border rounded-lg p-4 text-center space-y-1 bg-card"
                    >
                      <p className="text-xs text-muted-foreground">{step.label}</p>
                      <p className="text-2xl font-bold">
                        {step.format === "percent" ? avg.toFixed(1) + "%" : Math.round(avg).toLocaleString("ru-RU")}
                      </p>
                      <p className="text-xs text-muted-foreground">среднее</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Нет данных воронки за период
              </div>
            )}
          </TabsContent>

          {/* Реклама */}
          <TabsContent value="ads" className="space-y-4">
            {!isLoading && hasData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Показы", value: data!.totals.adv_views, format: "number" },
                  { label: "Клики", value: data!.totals.adv_clicks, format: "number" },
                  { label: "CTR", value: data!.totals.percent_ctr, format: "percent" },
                  { label: "Расход", value: data!.totals.adv_expenses, format: "money" },
                  { label: "Выручка с рекл.", value: data!.totals.adv_revenue, format: "money" },
                  { label: "ДРР", value: data!.totals.percent_drr, format: "percent" },
                ].map((m) => (
                  <div key={m.label} className="border rounded-lg p-4 bg-card space-y-1">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="text-xl font-bold tabular-nums">
                      {m.format === "money"
                        ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(m.value) + " ₽"
                        : m.format === "percent"
                        ? m.value.toFixed(1) + "%"
                        : new Intl.NumberFormat("ru-RU").format(Math.round(m.value))}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Нет рекламных данных за период
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
