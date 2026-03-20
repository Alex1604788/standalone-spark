import { useState, useMemo, useCallback } from "react";
import {
  Truck, Upload, RefreshCw, Plus, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, Download, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  calcAllocationForProduct,
  applyManualOverride,
  expandBom,
  type AllocationResult,
  type Cluster,
  type SellerCategory,
  type ClusterDistributionShare,
} from "@/lib/procurement-calculations";

// ============================================================
// ХУКИ ДАННЫХ
// ============================================================

function useProcurementData(marketplaceId: string) {
  return useQuery({
    queryKey: ["procurement-data", marketplaceId],
    enabled: !!marketplaceId,
    queryFn: async () => {
      const [
        { data: clusters },
        { data: categories },
        { data: salesPlan },
        { data: productBiz },
        { data: distributions },
        { data: stocks },
        { data: inTransit },
        { data: products },
        { data: bom },
      ] = await Promise.all([
        supabase.from("clusters").select("*").eq("marketplace_id", marketplaceId).eq("is_active", true).order("priority"),
        supabase.from("seller_categories").select("*").eq("marketplace_id", marketplaceId),
        supabase.from("sales_plan").select("*").eq("marketplace_id", marketplaceId)
          .eq("plan_month", new Date().toISOString().slice(0, 7) + "-01"),
        supabase.from("product_business_data").select("*").eq("marketplace_id", marketplaceId),
        supabase.from("ozon_category_cluster_distribution").select("*, clusters(id, name, short_name, priority)").eq("marketplace_id", marketplaceId),
        supabase.from("ozon_stocks_daily").select("offer_id, fbo_stocks").eq("marketplace_id", marketplaceId)
          .eq("date", new Date().toISOString().split("T")[0]).limit(5000),
        supabase.from("manual_in_transit").select("*").eq("marketplace_id", marketplaceId).eq("status", "open"),
        supabase.from("products").select("offer_id, name, description_category_id").eq("marketplace_id", marketplaceId),
        supabase.from("product_bom").select("*").eq("marketplace_id", marketplaceId),
      ]);

      return { clusters, categories, salesPlan, productBiz, distributions, stocks, inTransit, products, bom };
    },
  });
}

// ============================================================
// УТИЛИТЫ ФОРМАТИРОВАНИЯ
// ============================================================

function fmtQty(v: number): string {
  if (v === 0) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(v));
}

// ============================================================
// КОМПОНЕНТ: Строка товара в таблице распределения
// ============================================================

function AllocationRow({
  result,
  clusters,
  onOverride,
}: {
  result: AllocationResult;
  clusters: Cluster[];
  onOverride: (clusterId: string, qty: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const handleOverrideCommit = (clusterId: string) => {
    const qty = parseInt(editVal, 10);
    if (!isNaN(qty) && qty >= 0) {
      onOverride(clusterId, qty);
    }
    setEditing(null);
  };

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/30 transition-colors ${result.has_warning ? "bg-amber-50/30" : ""}`}
      >
        {/* Товар */}
        <td className="sticky left-0 bg-background px-3 py-2 z-10">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-muted-foreground hover:text-foreground"
            >
              {expanded
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate max-w-36">
                {result.product_name || result.offer_id}
              </div>
              <div className="text-xs text-muted-foreground">{result.offer_id}</div>
            </div>
            {result.has_warning && (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            )}
          </div>
        </td>

        {/* План */}
        <td className="text-right px-2 py-2 text-xs tabular-nums font-medium">
          {fmtQty(result.plan_qty)}
        </td>

        {/* ЦС остаток */}
        <td className={`text-right px-2 py-2 text-xs tabular-nums ${result.central_stock_after < 0 ? "text-red-600 font-medium" : ""}`}>
          {fmtQty(result.central_stock_before)}
          <span className="text-muted-foreground mx-0.5">→</span>
          <span>{fmtQty(Math.max(0, result.central_stock_after))}</span>
        </td>

        {/* Кластеры */}
        {clusters.map((cl) => {
          const cr = result.clusters.find((c) => c.cluster_id === cl.id);
          if (!cr) {
            return (
              <td key={cl.id} className="text-center px-2 py-2 text-xs text-muted-foreground/30 border-l">
                —
              </td>
            );
          }

          const isEditing = editing === cl.id;
          const hasOverride = cr.manual_override !== undefined;

          return (
            <td
              key={cl.id}
              className="px-1.5 py-1 text-xs border-l"
              onDoubleClick={() => {
                setEditing(cl.id);
                setEditVal(String(cr.qty_to_ship));
              }}
            >
              {isEditing ? (
                <input
                  type="number"
                  value={editVal}
                  autoFocus
                  className="w-14 text-xs text-center border rounded px-1 py-0.5"
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => handleOverrideCommit(cl.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleOverrideCommit(cl.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  min={0}
                />
              ) : (
                <div className="text-center">
                  {/* Норма (серая) */}
                  <div className="text-muted-foreground text-[10px]">
                    {Math.round(cr.cluster_norm)}
                  </div>
                  {/* К отгрузке (цветная) */}
                  <div
                    className={`font-medium tabular-nums ${
                      cr.qty_to_ship === 0
                        ? "text-muted-foreground/40"
                        : hasOverride
                        ? "text-blue-600"
                        : "text-foreground"
                    }`}
                  >
                    {cr.qty_to_ship === 0 ? "·" : fmtQty(cr.qty_to_ship)}
                  </div>
                </div>
              )}
            </td>
          );
        })}

        {/* К распределению итого */}
        <td className="text-right px-2 py-2 text-xs tabular-nums font-medium border-l-2 border-muted-foreground/30">
          {fmtQty(result.total_to_distribute)}
        </td>

        {/* К заказу поставщику */}
        <td
          className={`text-right px-2 py-2 text-xs tabular-nums font-medium ${
            result.supplier_need > 0 ? "text-violet-600" : "text-muted-foreground/40"
          }`}
        >
          {result.supplier_need > 0 ? fmtQty(result.supplier_need) : "·"}
        </td>
      </tr>

      {/* Развёрнутая строка — детали расчёта */}
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={4 + clusters.length} className="px-6 py-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Как посчитано:</p>
              <div className="space-y-1 text-xs font-mono">
                <p>Норма ЦС = план ({result.plan_qty}) × КФ обесп + план × срок/30 = <strong>{Math.round(result.central_norm)}</strong></p>
                <p>К распределению итого: <strong>{Math.round(result.total_to_distribute)}</strong></p>
                <p>Остаток ЦС после: {result.central_stock_before} − {Math.round(result.total_to_distribute)} = <strong className={result.central_stock_after < 0 ? "text-red-600" : "text-emerald-600"}>{Math.round(result.central_stock_after)}</strong></p>
                <p>К заказу поставщику: <strong className="text-violet-600">{Math.round(result.supplier_need)}</strong></p>
              </div>
              {result.warnings.length > 0 && (
                <div className="space-y-0.5 mt-2">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">💡 Двойной клик на ячейке кластера для ручной корректировки</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ============================================================
// ГЛАВНАЯ СТРАНИЦА
// ============================================================

export default function Procurement() {
  const queryClient = useQueryClient();

  const { data: marketplace } = useQuery({
    queryKey: ["user-marketplace"],
    queryFn: async () => {
      const { data } = await supabase.from("marketplaces").select("id, name").eq("is_active", true).limit(1).single();
      return data;
    },
  });

  const marketplaceId = marketplace?.id || "";
  const { data: pd, isLoading } = useProcurementData(marketplaceId);

  // Ручные корректировки (in-memory до сохранения)
  const [overrides, setOverrides] = useState<Map<string, Map<string, number>>>(new Map());

  // Загрузка плана продаж из CSV/Excel
  const [planFile, setPlanFile] = useState<File | null>(null);

  // ============================================================
  // РАСЧЁТ
  // ============================================================
  const allocationResults = useMemo<AllocationResult[]>(() => {
    if (!pd?.salesPlan?.length || !pd?.clusters?.length) return [];

    // Строим вспомогательные Map-ы
    const categoriesMap = new Map(
      (pd.categories || []).map((c) => [c.code, c as SellerCategory])
    );

    const bizMap = new Map(
      (pd.productBiz || []).map((b) => [b.offer_id, b])
    );

    const productMap = new Map(
      (pd.products || []).map((p) => [p.offer_id, p])
    );

    // Остатки по кластерам: из ozon_stocks_daily берём FBO для FBO-кластеров
    // Для MVP: сумма FBO stocks делится по долям (реальные данные по кластерам из Ozon API v2)
    const stockMap = new Map<string, number>(
      (pd.stocks || []).map((s) => [s.offer_id, s.fbo_stocks ?? 0])
    );

    // In-transit по (offer_id, cluster_id)
    const transitMap = new Map<string, Map<string, number>>();
    for (const t of pd.inTransit || []) {
      if (!transitMap.has(t.offer_id)) transitMap.set(t.offer_id, new Map());
      transitMap.get(t.offer_id)!.set(t.cluster_id, (transitMap.get(t.offer_id)!.get(t.cluster_id) ?? 0) + t.qty);
    }

    const clustersMeta = new Map<string, Cluster>(
      (pd.clusters || []).map((c) => [c.id, c as Cluster])
    );

    const results: AllocationResult[] = [];

    for (const plan of pd.salesPlan || []) {
      const product = productMap.get(plan.offer_id);
      const biz = bizMap.get(plan.offer_id);
      const categoryCode = biz?.seller_category_code || "1";
      const category = categoriesMap.get(categoryCode) || {
        code: categoryCode,
        coverage_coef: 1.0,
        distribution_coef: 1.0,
        is_novelty: false,
      };

      // Доли по кластерам для категории товара
      const catId = product?.description_category_id;
      const distShares: ClusterDistributionShare[] = catId
        ? (pd.distributions || [])
            .filter((d) => d.description_category_id === catId)
            .map((d) => ({
              cluster_id: d.cluster_id,
              cluster_name: (d as { clusters?: { name: string } }).clusters?.name || d.cluster_id,
              cluster_short: (d as { clusters?: { short_name: string } }).clusters?.short_name || d.cluster_id,
              distribution_share: d.distribution_share,
            }))
        : [];

      // Если нет настроенных долей — пропускаем
      if (distShares.length === 0 && (pd.clusters || []).length > 0) {
        // Равномерное распределение как fallback
        const share = 1 / (pd.clusters || []).length;
        for (const cl of pd.clusters || []) {
          distShares.push({
            cluster_id: cl.id,
            cluster_name: cl.name,
            cluster_short: cl.short_name,
            distribution_share: share,
          });
        }
      }

      const clusterStockMap = new Map<string, number>();
      // Для MVP: берём общий FBO остаток и распределяем по долям
      const totalFbo = stockMap.get(plan.offer_id) ?? 0;
      for (const d of distShares) {
        clusterStockMap.set(d.cluster_id, Math.floor(totalFbo * d.distribution_share));
      }

      let result = calcAllocationForProduct(plan.offer_id, product?.name, {
        plan_qty: plan.plan_qty,
        seller_category: category as SellerCategory,
        product_business: {
          offer_id: plan.offer_id,
          seller_category_code: categoryCode,
          lead_time_days: biz?.lead_time_days ?? 14,
          small_box_quantity: biz?.small_box_quantity,
          large_box_quantity: biz?.large_box_quantity,
          central_stock: biz?.central_stock ?? 0,
        },
        distributions: distShares,
        clusters_meta: clustersMeta,
        stock_by_cluster: clusterStockMap,
        in_transit_by_cluster: transitMap.get(plan.offer_id) || new Map(),
      });

      // Применяем ручные корректировки
      const rowOverrides = overrides.get(plan.offer_id);
      if (rowOverrides) {
        for (const [clusterId, qty] of rowOverrides.entries()) {
          result = applyManualOverride(result, clusterId, qty);
        }
      }

      results.push(result);
    }

    return results;
  }, [pd, overrides]);

  const handleOverride = useCallback((offerId: string, clusterId: string, qty: number) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (!next.has(offerId)) next.set(offerId, new Map());
      next.get(offerId)!.set(clusterId, qty);
      return next;
    });
  }, []);

  // Итоговая сводка
  const summary = useMemo(() => ({
    totalSupplierNeed: allocationResults.reduce((s, r) => s + r.supplier_need, 0),
    totalToDistribute: allocationResults.reduce((s, r) => s + r.total_to_distribute, 0),
    warningCount: allocationResults.filter((r) => r.has_warning).length,
    productsCount: allocationResults.length,
  }), [allocationResults]);

  const hasSetup = (pd?.clusters?.length ?? 0) > 0;
  const hasPlan = (pd?.salesPlan?.length ?? 0) > 0;

  // ============================================================
  // СОХРАНЕНИЕ СЕССИИ
  // ============================================================
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Создаём сессию
      const { data: session, error: se } = await supabase
        .from("allocation_sessions")
        .insert({ marketplace_id: marketplaceId, working_date: new Date().toISOString().split("T")[0], status: "active" })
        .select("id").single();
      if (se) throw se;

      // 2. Создаём версию BASE
      const { data: version, error: ve } = await supabase
        .from("allocation_versions")
        .insert({ session_id: session.id, version_no: 1, version_type: "BASE", status: "confirmed" })
        .select("id").single();
      if (ve) throw ve;

      // 3. Для каждого кластера создаём заказ и строки
      const clusterMap = new Map<string, string>(); // cluster_id → order_id
      const clusters = pd?.clusters || [];
      for (const cl of clusters) {
        const { data: order } = await supabase
          .from("shipment_orders")
          .insert({ version_id: version.id, cluster_id: cl.id, status: "confirmed" })
          .select("id").single();
        if (order) clusterMap.set(cl.id, order.id);
      }

      // 4. Строки по каждому товару-кластеру
      const items: object[] = [];
      for (const result of allocationResults) {
        for (const cr of result.clusters) {
          if (cr.qty_to_ship <= 0) continue;
          const orderId = clusterMap.get(cr.cluster_id);
          if (!orderId) continue;
          items.push({
            order_id: orderId,
            offer_id: result.offer_id,
            cluster_norm: cr.cluster_norm,
            cluster_need: cr.cluster_need_final,
            qty_to_ship: cr.qty_to_ship,
            manual_override: cr.manual_override ?? null,
          });
        }
      }

      if (items.length > 0) {
        const { error: ie } = await supabase.from("shipment_order_items").insert(items);
        if (ie) throw ie;
      }

      return { sessionId: session.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-data"] });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-4 md:p-6 space-y-5">

        {/* Заголовок */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Закупка и распределение</h1>
              <p className="text-sm text-muted-foreground">
                {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/app/procurement/settings">
                <Settings className="w-3.5 h-3.5" />
                Справочники
              </Link>
            </Button>
            {allocationResults.length > 0 && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {saveMutation.isPending ? "Сохраняю..." : "Зафиксировать"}
              </Button>
            )}
          </div>
        </div>

        {/* Не настроено */}
        {!isLoading && !hasSetup && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>Настройте справочники перед началом работы:</p>
              <ol className="list-decimal ml-4 text-sm space-y-1">
                <li>Добавьте кластеры (Справочники → Кластеры)</li>
                <li>Настройте категории товаров с коэффициентами</li>
                <li>Загрузите доли категорий Ozon по кластерам</li>
              </ol>
              <Button size="sm" asChild className="mt-2">
                <Link to="/app/procurement/settings">Перейти к справочникам</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Нет плана */}
        {!isLoading && hasSetup && !hasPlan && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Загрузите план продаж на текущий месяц для расчёта распределения.
            </AlertDescription>
          </Alert>
        )}

        {/* Сводка */}
        {allocationResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Товаров в расчёте</p>
                <p className="text-2xl font-bold">{summary.productsCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">К распределению шт</p>
                <p className="text-2xl font-bold">{new Intl.NumberFormat("ru-RU").format(Math.round(summary.totalToDistribute))}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">К заказу поставщику</p>
                <p className="text-2xl font-bold text-violet-600">{new Intl.NumberFormat("ru-RU").format(Math.round(summary.totalSupplierNeed))}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Предупреждений</p>
                <p className={`text-2xl font-bold ${summary.warningCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {summary.warningCount}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Вкладки */}
        <Tabs defaultValue="distribution">
          <TabsList className="h-9">
            <TabsTrigger value="distribution" className="text-xs">Распределение</TabsTrigger>
            <TabsTrigger value="supplier" className="text-xs">Заказ поставщику</TabsTrigger>
            <TabsTrigger value="upload" className="text-xs">Загрузка данных</TabsTrigger>
          </TabsList>

          {/* ТАБЛИЦА РАСПРЕДЕЛЕНИЯ */}
          <TabsContent value="distribution" className="mt-3">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Загрузка данных...</div>
            ) : allocationResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Нет данных для расчёта. Загрузите план продаж.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="sticky left-0 bg-muted/50 text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap min-w-44 z-10">
                          Товар
                        </th>
                        <th className="text-right px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          План шт
                        </th>
                        <th className="text-right px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          ЦС до→после
                        </th>
                        {(pd?.clusters || []).map((cl) => (
                          <th
                            key={cl.id}
                            className="text-center px-1.5 py-2 text-xs text-muted-foreground whitespace-nowrap border-l"
                            title={cl.name}
                          >
                            <div className="text-[10px] text-muted-foreground/60">норма</div>
                            <div>{cl.short_name}</div>
                          </th>
                        ))}
                        <th className="text-right px-2 py-2 text-xs text-muted-foreground whitespace-nowrap border-l-2 border-muted-foreground/30">
                          Итого
                        </th>
                        <th className="text-right px-2 py-2 text-xs text-violet-600 whitespace-nowrap">
                          К заказу
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocationResults.map((result) => (
                        <AllocationRow
                          key={result.offer_id}
                          result={result}
                          clusters={pd?.clusters || []}
                          onOverride={(clusterId, qty) =>
                            handleOverride(result.offer_id, clusterId, qty)
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Двойной клик на ячейке кластера для ручной корректировки
                </div>
              </div>
            )}
          </TabsContent>

          {/* СВОДКА ЗАКАЗА ПОСТАВЩИКУ */}
          <TabsContent value="supplier" className="mt-3">
            {allocationResults.filter((r) => r.supplier_need > 0).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Нет позиций к заказу поставщику
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 text-xs text-muted-foreground">Товар</th>
                      <th className="text-right px-3 py-2 text-xs text-muted-foreground">План шт</th>
                      <th className="text-right px-3 py-2 text-xs text-muted-foreground">Норма ЦС</th>
                      <th className="text-right px-3 py-2 text-xs text-muted-foreground">Остаток ЦС</th>
                      <th className="text-right px-3 py-2 text-xs text-violet-600 font-medium">К заказу шт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationResults
                      .filter((r) => r.supplier_need > 0)
                      .sort((a, b) => b.supplier_need - a.supplier_need)
                      .map((r) => (
                        <tr key={r.offer_id} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <div className="text-xs font-medium">{r.product_name || r.offer_id}</div>
                            <div className="text-xs text-muted-foreground">{r.offer_id}</div>
                          </td>
                          <td className="text-right px-3 py-2 text-xs tabular-nums">{fmtQty(r.plan_qty)}</td>
                          <td className="text-right px-3 py-2 text-xs tabular-nums">{fmtQty(r.central_norm)}</td>
                          <td className="text-right px-3 py-2 text-xs tabular-nums">{fmtQty(r.central_stock_before)}</td>
                          <td className="text-right px-3 py-2 text-xs tabular-nums font-bold text-violet-600">
                            {fmtQty(r.supplier_need)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-xs font-medium text-right text-muted-foreground">
                        Итого к заказу:
                      </td>
                      <td className="px-3 py-2 text-xs font-bold text-right text-violet-600 tabular-nums">
                        {fmtQty(summary.totalSupplierNeed)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ЗАГРУЗКА ДАННЫХ */}
          <TabsContent value="upload" className="mt-3 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Загрузка плана продаж</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  CSV или Excel файл с колонками: <code className="bg-muted px-1 rounded">offer_id</code>, <code className="bg-muted px-1 rounded">plan_qty</code>
                </p>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => setPlanFile(e.target.files?.[0] || null)}
                    className="text-xs h-8"
                  />
                  <Button
                    size="sm"
                    disabled={!planFile}
                    className="gap-1.5 flex-shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Загрузить
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Месяц плана: <strong>{new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</strong>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Остатки центрального склада</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  CSV с колонками: <code className="bg-muted px-1 rounded">offer_id</code>, <code className="bg-muted px-1 rounded">qty</code>
                  <br />Данные берутся из 1С по кнопке.
                </p>
                <div className="flex gap-2">
                  <Input type="file" accept=".csv" className="text-xs h-8" />
                  <Button size="sm" className="gap-1.5 flex-shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    Загрузить
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
