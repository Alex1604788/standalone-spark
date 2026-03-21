import { ShoppingCart, Package, TrendingUp, RotateCcw, Eye, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricTooltip } from "./MetricTooltip";
import type { TotalSummary } from "@/lib/analytics-calculations";

interface KpiCardsProps {
  totals: TotalSummary | null;
  isLoading: boolean;
}

function formatMoney(v: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatNum(v: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(v));
}

function formatPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

interface CardConfig {
  key: keyof TotalSummary;
  label: string;
  icon: React.ReactNode;
  format: "money" | "number" | "percent" | "days";
  formula?: string;
  benchmark?: string;
  color: string;
  secondary?: (t: TotalSummary) => string;
}

const CARDS: CardConfig[] = [
  {
    key: "revenue",
    label: "Заказано",
    icon: <ShoppingCart className="w-5 h-5" />,
    format: "money",
    formula: "Сумма оформленных заказов за период",
    color: "text-blue-600",
    secondary: (t) => `${formatNum(t.ordered_units)} шт`,
  },
  {
    key: "bought_in_ozon_orders",
    label: "Выкуплено",
    icon: <Package className="w-5 h-5" />,
    format: "number",
    formula: "Количество фактически выкупленных единиц",
    color: "text-emerald-600",
    secondary: (t) => `${formatPercent(t.redemption_rate)} выкуп`,
  },
  {
    key: "profit",
    label: "Прибыль",
    icon: <TrendingUp className="w-5 h-5" />,
    format: "money",
    formula: "Выручка − себестоимость (без комиссий Ozon — нужны данные финансового отчёта)",
    benchmark: "Чем больше, тем лучше",
    color: "text-violet-600",
  },
  {
    key: "cancellation_rate",
    label: "% отмен",
    icon: <RotateCcw className="w-5 h-5" />,
    format: "percent",
    formula: "Отмены / Заказано × 100",
    benchmark: "Хорошо < 5% | Норма < 10%",
    color: "text-amber-600",
    secondary: (t) => `${formatNum(t.cancellations)} отмен`,
  },
  {
    key: "session_view",
    label: "Просмотры",
    icon: <Eye className="w-5 h-5" />,
    format: "number",
    formula: "Сессии с просмотром товара (session_view)",
    color: "text-sky-600",
  },
  {
    key: "avg_turnover_days",
    label: "Оборачиваемость",
    icon: <Clock className="w-5 h-5" />,
    format: "days",
    formula: "(FBO + FBS) / средние_продажи_в_день",
    benchmark: "Норма: 30−60 дней",
    color: "text-orange-600",
  },
];

function getCancellationColor(v: number): string {
  if (v <= 5) return "text-emerald-600";
  if (v <= 10) return "text-amber-500";
  return "text-red-600";
}

export function KpiCards({ totals, isLoading }: KpiCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {CARDS.map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-7 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!totals) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {CARDS.map((card) => {
        const raw = totals[card.key] as number;

        const formatted =
          card.format === "money" ? formatMoney(raw)
          : card.format === "percent" ? formatPercent(raw)
          : card.format === "days" ? `${Math.round(raw)} дн`
          : formatNum(raw);

        const valueColor =
          card.key === "cancellation_rate" ? getCancellationColor(raw) : card.color;

        return (
          <Card
            key={card.key}
            className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <MetricTooltip label={card.label} formula={card.formula} benchmark={card.benchmark}>
                  <span className="text-xs font-medium text-muted-foreground truncate">
                    {card.label}
                  </span>
                </MetricTooltip>
                <span className={`${card.color} opacity-60`}>{card.icon}</span>
              </div>
              <div className={`text-xl font-bold tabular-nums ${valueColor}`}>
                {formatted}
              </div>
              {card.secondary && (
                <div className="text-xs text-muted-foreground">
                  {card.secondary(totals)}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
