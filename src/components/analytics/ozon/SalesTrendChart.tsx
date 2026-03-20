import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyPoint } from "@/lib/analytics-calculations";

interface SalesTrendChartProps {
  data: DailyPoint[];
  isLoading?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${d.toLocaleString("ru-RU", { month: "short" })}`;
}

function formatRub(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}М ₽`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}К ₽`;
  return `${value} ₽`;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-xs space-y-1.5">
      <p className="font-medium text-sm">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-medium tabular-nums">
            {p.name.includes("шт")
              ? new Intl.NumberFormat("ru-RU").format(p.value) + " шт"
              : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(p.value) + " ₽"}
          </span>
        </div>
      ))}
    </div>
  );
};

export function SalesTrendChart({ data, isLoading }: SalesTrendChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Динамика продаж</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Динамика продаж</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            Нет данных за период
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    "Заказано ₽": Math.round(d.ordered_amount),
    "Выкуплено ₽": Math.round(d.bought_amount),
    "Реклама ₽": Math.round(d.adv_expenses),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Динамика продаж по дням</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradOrdered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradBought" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAdv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatRub}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Area
              type="monotone"
              dataKey="Заказано ₽"
              stroke="#6366f1"
              fill="url(#gradOrdered)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="Выкуплено ₽"
              stroke="#22c55e"
              fill="url(#gradBought)"
              strokeWidth={2}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="Реклама ₽"
              stroke="#f59e0b"
              fill="url(#gradAdv)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
