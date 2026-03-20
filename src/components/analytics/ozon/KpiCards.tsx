import { TrendingUp, TrendingDown, ShoppingCart, Package, Megaphone, BarChart2, RotateCcw, Clock } from "lucide-react";
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
  goodDirection: "up" | "down" | "neutral";
  threshold?: { good: number; bad: number };
  color?: string;
}

const CARDS: CardConfig[] = [
  {
    key: "ordered_amount",
    label: "Заказано",
    icon: <ShoppingCart className="w-5 h-5" />,
    format: "money",
    formula: "Сумма оформленных заказов за период",
    goodDirection: "up",
    color: "text-blue-600",
  },
  {
    key: "bought_amount",
    label: "Выкуплено",
    icon: <Package className="w-5 h-5" />,
    format: "money",
    formula: "Сумма фактически выкупленных товаров",
    goodDirection: "up",
    color: "text-emerald-600",
  },
  {
    key: "profit",
    label: "Прибыль",
    icon: <TrendingUp className="w-5 h-5" />,
    format: "money",
    formula: "Выкупы − комиссии − расходы − себестоимость",
    benchmark: "Чем больше, тем лучше",
    goodDirection: "up",
    color: "text-violet-600",
  },
  {
    key: "adv_expenses",
    label: "Расходы на рекламу",
    icon: <Megaphone className="w-5 h-5" />,
    format: "money",
    formula: "Суммарные расходы на рекламные кампании",
    goodDirection: "neutral",
    color: "text-amber-600",
  },
  {
    key: "percent_drr",
    label: "ДРР",
    icon: <BarChart2 className="w-5 h-5" />,
    format: "percent",
    formula: "adv_expenses / ordered_amount × 100",
    benchmark: "Хорошо < 10% | Норма < 15% | Высокий > 20%",
    goodDirection: "down",
    threshold: { good: 10, bad: 20 },
    color: "text-orange-600",
  },
  {
    key: "avg_turnover_days",
    label: "Оборачиваемость",
    icon: <Clock className="w-5 h-5" />,
    format: "days",
    formula: "(FBO + FBS) / средние_продажи_в_день",
    benchmark: "Норма: 30−60 дней",
    goodDirection: "neutral",
    color: "text-sky-600",
  },
];

function getDrrColor(value: number): string {
  if (value <= 10) return "text-emerald-600";
  if (value <= 15) return "text-amber-500";
  if (value <= 20) return "text-orange-500";
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
          card.format === "money"
            ? formatMoney(raw)
            : card.format === "percent"
            ? formatPercent(raw)
            : card.format === "days"
            ? `${Math.round(raw)} дн`
            : formatNum(raw);

        // Цвет для ДРР
        const valueColor =
          card.key === "percent_drr"
            ? getDrrColor(raw)
            : card.color;

        return (
          <Card
            key={card.key}
            className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <MetricTooltip
                  label={card.label}
                  formula={card.formula}
                  benchmark={card.benchmark}
                >
                  <span className="text-xs font-medium text-muted-foreground truncate">
                    {card.label}
                  </span>
                </MetricTooltip>
                <span className={`${card.color} opacity-60`}>{card.icon}</span>
              </div>
              <div className={`text-xl font-bold tabular-nums ${valueColor}`}>
                {formatted}
              </div>
              {/* Дополнительный контекст */}
              {card.key === "ordered_amount" && (
                <div className="text-xs text-muted-foreground">
                  {formatNum(totals.ordered_cnt)} шт
                </div>
              )}
              {card.key === "bought_amount" && (
                <div className="text-xs text-muted-foreground">
                  {formatNum(totals.bought_cnt)} шт
                </div>
              )}
              {card.key === "percent_drr" && (
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      raw <= 10 ? "bg-emerald-500" :
                      raw <= 15 ? "bg-amber-500" :
                      raw <= 20 ? "bg-orange-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(100, (raw / 30) * 100)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
