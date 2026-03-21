import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { MetricTooltip } from "./MetricTooltip";
import type { ProductMetrics } from "@/lib/analytics-calculations";

// ============================================================
// КОНФИГУРАЦИЯ ГРУПП КОЛОНОК
// ============================================================

interface ColDef {
  key: keyof ProductMetrics;
  label: string;
  formula?: string;
  benchmark?: string;
  format: "money" | "number" | "percent" | "days" | "score";
  colorFn?: (v: number) => string;
  width?: number;
}

interface ColGroup {
  id: string;
  label: string;
  defaultVisible: boolean;
  columns: ColDef[];
}

function drrColor(v: number) {
  if (v <= 10) return "text-emerald-600 bg-emerald-50";
  if (v <= 15) return "text-amber-600 bg-amber-50";
  if (v <= 20) return "text-orange-600 bg-orange-50";
  return "text-red-600 bg-red-50";
}

function turnoverColor(v: number) {
  if (v === 0) return "text-gray-400";
  if (v <= 30) return "text-red-600";   // мало — скоро закончится
  if (v <= 60) return "text-emerald-600";
  if (v <= 90) return "text-amber-600";
  return "text-orange-600"; // слишком много — заморозка
}

function profitColor(v: number) {
  if (v > 0) return "text-emerald-600";
  if (v === 0) return "text-gray-500";
  return "text-red-600";
}

const COLUMN_GROUPS: ColGroup[] = [
  {
    id: "sales",
    label: "Продажи",
    defaultVisible: true,
    columns: [
      { key: "ordered_units", label: "Заказ шт", format: "number",
        formula: "Количество заказанных единиц" },
      { key: "revenue", label: "Выручка ₽", format: "money",
        formula: "Сумма оформленных заказов" },
      { key: "bought_in_ozon_orders", label: "Выкуп шт", format: "number",
        formula: "Фактически выкупленных единиц" },
      { key: "redemption_rate", label: "% выкупа", format: "percent",
        formula: "bought / ordered × 100",
        benchmark: "Хорошо > 80%",
        colorFn: (v) => v < 60 ? "text-red-600 bg-red-50" : v < 80 ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50" },
      { key: "cancellations", label: "Отмены", format: "number",
        formula: "Количество отменённых заказов" },
      { key: "cancellation_rate", label: "% отмен", format: "percent",
        formula: "cancelled / ordered × 100",
        benchmark: "Хорошо < 5%",
        colorFn: (v) => v > 10 ? "text-red-600 bg-red-50" : v > 5 ? "text-amber-600 bg-amber-50" : "" },
    ],
  },
  {
    id: "funnel",
    label: "Воронка",
    defaultVisible: true,
    columns: [
      { key: "session_view", label: "Сессии", format: "number",
        formula: "Сессии с просмотром товара" },
      { key: "session_view_pdp", label: "Карточка", format: "number",
        formula: "Просмотры страницы товара (PDP)" },
      { key: "hits_view", label: "Хиты", format: "number",
        formula: "Всего просмотров товара" },
      { key: "conv_tocart_pdp", label: "В корзину %", format: "percent",
        formula: "% добавлений в корзину с карточки",
        benchmark: "Хорошо > 10%" },
      { key: "conv_topurchase_pdp", label: "CR покупки %", format: "percent",
        formula: "% покупок с карточки",
        benchmark: "Хорошо > 5%" },
    ],
  },
  {
    id: "stocks",
    label: "Остатки",
    defaultVisible: true,
    columns: [
      { key: "fbo_stocks", label: "FBO", format: "number",
        formula: "Остаток на складах Ozon (FBO)" },
      { key: "fbs_stocks", label: "FBS", format: "number",
        formula: "Остаток на своём складе (FBS)" },
      { key: "turnover_days", label: "Оборач дн", format: "days",
        formula: "(FBO + FBS) / средние_продажи_в_день",
        benchmark: "Норма: 30−60 дней",
        colorFn: turnoverColor },
      { key: "fbo_days", label: "FBO хватит", format: "days",
        formula: "FBO / средние_продажи_в_день",
        benchmark: "Критично < 14 дней",
        colorFn: (v) => v > 0 && v < 14 ? "text-red-600 bg-red-50" : v < 30 ? "text-amber-600 bg-amber-50" : "text-emerald-600" },
    ],
  },
  {
    id: "profitability",
    label: "Доходность",
    defaultVisible: false,
    columns: [
      { key: "profit", label: "Прибыль ₽", format: "money",
        formula: "Выручка − себестоимость (без комиссий Ozon)",
        colorFn: profitColor },
      { key: "profit_unit", label: "Прибыль/шт", format: "money",
        formula: "profit / выкуплено",
        colorFn: profitColor },
      { key: "margin_percent", label: "Маржа %", format: "percent",
        formula: "(цена − себестоимость) / цена × 100" },
      { key: "ros_percent", label: "ROS %", format: "percent",
        formula: "profit / revenue × 100",
        benchmark: "Хорошо > 10%" },
      { key: "revenue_per_unit", label: "Ср цена ₽", format: "money",
        formula: "revenue / ordered_units" },
    ],
  },
];

// ============================================================
// ФОРМАТИРОВАНИЕ
// ============================================================

function fmt(value: number, format: ColDef["format"]): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "money":
      return value === 0
        ? "—"
        : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value) + " ₽";
    case "percent":
      return value === 0 ? "0%" : value.toFixed(1) + "%";
    case "days":
      return value === 0 ? "—" : Math.round(value) + " дн";
    case "score":
      return value.toFixed(0);
    default:
      return value === 0
        ? "—"
        : new Intl.NumberFormat("ru-RU").format(Math.round(value));
  }
}

// ============================================================
// КОМПОНЕНТ
// ============================================================

interface ProductsTableProps {
  data: ProductMetrics[];
  isLoading?: boolean;
}

type SortDir = "asc" | "desc";

export function ProductsTable({ data, isLoading }: ProductsTableProps) {
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(COLUMN_GROUPS.map((g) => [g.id, g.defaultVisible]))
  );
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof ProductMetrics>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleGroup = (id: string) => {
    setVisibleGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSort = (key: keyof ProductMetrics) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const activeColumns = useMemo(
    () =>
      COLUMN_GROUPS.filter((g) => visibleGroups[g.id]).flatMap((g) => g.columns),
    [visibleGroups]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.filter(
      (r) =>
        !q ||
        r.offer_id.toLowerCase().includes(q) ||
        (r.product_name || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] as number) ?? 0;
      const bv = (b[sortKey] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortDir]);

  // CSV экспорт
  const exportCsv = () => {
    const headers = ["offer_id", "Название", ...activeColumns.map((c) => c.label)];
    const rows = sorted.map((row) => [
      row.offer_id,
      row.product_name || "",
      ...activeColumns.map((c) => row[c.key] ?? ""),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ozon-analytics-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const SortIcon = ({ col }: { col: keyof ProductMetrics }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  return (
    <div className="space-y-3">
      {/* Тулбар */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Поиск */}
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по артикулу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Группы колонок */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Показать:</span>
          {COLUMN_GROUPS.map((g) => (
            <Toggle
              key={g.id}
              pressed={visibleGroups[g.id]}
              onPressedChange={() => toggleGroup(g.id)}
              size="sm"
              className="h-7 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {g.label}
            </Toggle>
          ))}
        </div>

        {/* Экспорт */}
        <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 gap-1.5">
          <Download className="w-3.5 h-3.5" />
          CSV
        </Button>
      </div>

      {/* Таблица */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {/* Фиксированная колонка — товар */}
                <th className="sticky left-0 bg-muted/50 text-left px-3 py-2 font-medium text-xs text-muted-foreground whitespace-nowrap min-w-48 z-10">
                  Товар
                </th>

                {/* Группы с разделителями */}
                {COLUMN_GROUPS.filter((g) => visibleGroups[g.id]).map((group, gi) =>
                  group.columns.map((col, ci) => (
                    <th
                      key={`${group.id}_${col.key}`}
                      className={`text-right px-2 py-2 font-medium text-xs whitespace-nowrap cursor-pointer hover:bg-muted transition-colors
                        ${ci === 0 && gi > 0 ? "border-l-2 border-muted-foreground/20" : ""}`}
                      onClick={() => handleSort(col.key)}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <MetricTooltip
                          label={col.label}
                          formula={col.formula}
                          benchmark={col.benchmark}
                        >
                          <span className="text-muted-foreground">{col.label}</span>
                        </MetricTooltip>
                        <SortIcon col={col.key} />
                      </div>
                    </th>
                  ))
                )}
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                // Скелетон загрузки
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    <td className="sticky left-0 bg-background px-3 py-2">
                      <div className="h-4 bg-muted rounded w-32" />
                    </td>
                    {activeColumns.map((col) => (
                      <td key={col.key} className="px-2 py-2 text-right">
                        <div className="h-4 bg-muted rounded w-16 ml-auto" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={1 + activeColumns.length}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    Нет данных за выбранный период
                  </td>
                </tr>
              ) : (
                sorted.map((row) => (
                  <>
                    <tr
                      key={row.offer_id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() =>
                        setExpandedRow(expandedRow === row.offer_id ? null : row.offer_id)
                      }
                    >
                      {/* Товар — sticky колонка */}
                      <td className="sticky left-0 bg-background px-3 py-2 z-10">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
                              expandedRow === row.offer_id ? "rotate-90" : ""
                            }`}
                          />
                          <div>
                            <div className="font-medium text-xs truncate max-w-40">
                              {row.product_name || row.offer_id}
                            </div>
                            <div className="text-xs text-muted-foreground">{row.offer_id}</div>
                          </div>
                        </div>
                      </td>

                      {/* Данные по колонкам */}
                      {COLUMN_GROUPS.filter((g) => visibleGroups[g.id]).map((group, gi) =>
                        group.columns.map((col, ci) => {
                          const value = row[col.key] as number ?? 0;
                          const cellColor = col.colorFn ? col.colorFn(value) : "";

                          return (
                            <td
                              key={`${group.id}_${col.key}`}
                              className={`px-2 py-2 text-right tabular-nums text-xs
                                ${ci === 0 && gi > 0 ? "border-l-2 border-muted-foreground/20" : ""}
                                ${cellColor}`}
                            >
                              <span className={`${cellColor ? "px-1 py-0.5 rounded text-xs font-medium" : ""}`}>
                                {fmt(value, col.format)}
                              </span>
                            </td>
                          );
                        })
                      )}
                    </tr>

                    {/* Развёрнутая строка — детали */}
                    {expandedRow === row.offer_id && (
                      <tr key={`${row.offer_id}_expanded`} className="bg-muted/20">
                        <td colSpan={1 + activeColumns.length} className="px-6 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="text-muted-foreground">Средняя цена</p>
                              <p className="font-medium">{row.revenue_per_unit ? Math.round(row.revenue_per_unit) + " ₽" : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">% возврата</p>
                              <p className="font-medium">{row.return_rate ? row.return_rate.toFixed(1) + "%" : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Возвраты (шт)</p>
                              <p className="font-medium">{row.returns ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Себестоимость/шт</p>
                              <p className="font-medium">{row.cost_price_unit ? Math.round(row.cost_price_unit) + " ₽" : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">FBO хватит (дн)</p>
                              <p className={`font-medium ${row.fbo_days > 0 && row.fbo_days < 14 ? "text-red-600" : ""}`}>
                                {row.fbo_days ? Math.round(row.fbo_days) + " дн" : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Хиты просмотров</p>
                              <p className="font-medium">{row.hits_view ? new Intl.NumberFormat("ru-RU").format(row.hits_view) : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">CR в покупку %</p>
                              <p className="font-medium">{row.conv_topurchase_pdp ? row.conv_topurchase_pdp.toFixed(2) + "%" : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Дней данных</p>
                              <p className="font-medium">{row.days_count}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Итого */}
        {!isLoading && sorted.length > 0 && (
          <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Показано: {sorted.length} из {data.length} товаров
          </div>
        )}
      </div>
    </div>
  );
}
