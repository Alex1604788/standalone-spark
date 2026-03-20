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
      { key: "ordered_cnt", label: "Заказ шт", format: "number",
        formula: "Количество заказов" },
      { key: "ordered_amount", label: "Заказ ₽", format: "money",
        formula: "Сумма заказов" },
      { key: "bought_cnt", label: "Выкуп шт", format: "number",
        formula: "Фактически выкупленных" },
      { key: "bought_amount", label: "Выкуп ₽", format: "money",
        formula: "Сумма выкупа" },
      { key: "returned_cnt", label: "Возврат", format: "number",
        formula: "Возвращённые заказы" },
      { key: "percent_cancellations_and_returns", label: "Отм+Воз %", format: "percent",
        formula: "(returned + cancelled) / ordered × 100",
        benchmark: "Норма < 10%",
        colorFn: (v) => v > 15 ? "text-red-600 bg-red-50" : v > 10 ? "text-amber-600 bg-amber-50" : "" },
    ],
  },
  {
    id: "ads",
    label: "Реклама",
    defaultVisible: true,
    columns: [
      { key: "adv_expenses", label: "Расход ₽", format: "money",
        formula: "Рекламные расходы" },
      { key: "percent_drr", label: "ДРР %", format: "percent",
        formula: "adv_expenses / ordered_amount × 100",
        benchmark: "Хорошо < 10%",
        colorFn: drrColor },
      { key: "percent_ctr", label: "CTR %", format: "percent",
        formula: "adv_clicks / adv_views × 100",
        benchmark: "Хорошо > 2%" },
      { key: "adv_cpc", label: "CPC ₽", format: "money",
        formula: "adv_expenses / adv_clicks" },
      { key: "adv_cpo", label: "CPO ₽", format: "money",
        formula: "adv_expenses / adv_orders (рекламные)" },
      { key: "adv_views", label: "Показы", format: "number",
        formula: "Показы рекламы" },
      { key: "adv_clicks", label: "Клики", format: "number",
        formula: "Клики по рекламе" },
    ],
  },
  {
    id: "funnel",
    label: "Воронка",
    defaultVisible: false,
    columns: [
      { key: "session_view", label: "Сессии", format: "number",
        formula: "Уникальные сессии просмотра" },
      { key: "percent_session_to_pdp", label: "В карточку %", format: "percent",
        formula: "посетители_карточки / сессии × 100",
        benchmark: "Хорошо > 5%" },
      { key: "percent_pdp_to_cart", label: "В корзину %", format: "percent",
        formula: "добавления / посетители_карточки × 100",
        benchmark: "Хорошо > 10%" },
      { key: "percent_cart_to_order", label: "Корзина→Заказ %", format: "percent",
        formula: "заказы / добавления × 100",
        benchmark: "Хорошо > 20%" },
      { key: "percent_order_to_buy", label: "CR выкупа %", format: "percent",
        formula: "выкупы / заказы × 100" },
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
        formula: "(FBO + FBS) / avg_weekly_orders × 7",
        benchmark: "Норма: 30−60 дней",
        colorFn: turnoverColor },
      { key: "available_in_days", label: "Хватит дн", format: "days",
        formula: "FBO / avg_weekly_orders × 7",
        benchmark: "Критично < 14 дней",
        colorFn: (v) => v < 14 ? "text-red-600 bg-red-50" : v < 30 ? "text-amber-600 bg-amber-50" : "text-emerald-600" },
    ],
  },
  {
    id: "profitability",
    label: "Доходность",
    defaultVisible: false,
    columns: [
      { key: "profit", label: "Прибыль ₽", format: "money",
        formula: "Выкупы − комиссии − расходы − себестоимость",
        colorFn: profitColor },
      { key: "profit_unit", label: "Прибыль/шт", format: "money",
        formula: "profit / bought_cnt",
        colorFn: profitColor },
      { key: "margin_percent", label: "Наценка %", format: "percent",
        formula: "(price_seller − cost_price) / cost_price × 100" },
      { key: "roi_percent", label: "ROI %", format: "percent",
        formula: "profit / (себестоимость + расходы) × 100",
        benchmark: "Хорошо > 30%" },
      { key: "ros_percent", label: "ROS %", format: "percent",
        formula: "profit / bought_amount × 100",
        benchmark: "Хорошо > 10%" },
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
  const [sortKey, setSortKey] = useState<keyof ProductMetrics>("ordered_amount");
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
                              <p className="text-muted-foreground">Категория</p>
                              <p className="font-medium">{row.category || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Контент-рейтинг</p>
                              <p className="font-medium">{row.content_rating ? row.content_rating.toFixed(0) + "%" : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Цена продавца</p>
                              <p className="font-medium">{row.price_seller ? Math.round(row.price_seller) + " ₽" : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Цена Ozon</p>
                              <p className="font-medium">{row.price_ozon ? Math.round(row.price_ozon) + " ₽" : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Индекс цены</p>
                              <p className={`font-medium ${row.price_index > 1.1 ? "text-red-600" : row.price_index < 0.9 ? "text-emerald-600" : ""}`}>
                                {row.price_index ? row.price_index.toFixed(2) : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Кликов на рекламу</p>
                              <p className="font-medium">{row.adv_clicks ? new Intl.NumberFormat("ru-RU").format(row.adv_clicks) : "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">CTR рекламы</p>
                              <p className="font-medium">{row.percent_ctr ? row.percent_ctr.toFixed(2) + "%" : "—"}</p>
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
