import { TrendingUp, TrendingDown, DollarSign, Percent, Package, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatMoney,
  formatPercent,
  formatChange,
  type CalculatedMetrics,
} from "@/lib/sales-calculations";

interface SalesCardsProps {
  period1: CalculatedMetrics;
  period2: CalculatedMetrics;
  total: CalculatedMetrics;
  changes: {
    salesRevenueChange: number;
    grossProfitChange: number;
    netMarginChange: number;
    marginPercentChange: number;
  };
}

export const SalesCards = ({ period1, period2, total, changes }: SalesCardsProps) => {
  // Форматирование изменения с иконкой
  const renderChange = (value: number) => {
    const { text, color } = formatChange(value);
    const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
    const colorClass = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-gray-600';

    return (
      <div className={`flex items-center gap-1 text-sm font-medium ${colorClass}`}>
        <Icon className="w-4 h-4" />
        <span>{text}</span>
      </div>
    );
  };

  const cards = [
    {
      title: "Продажи",
      icon: DollarSign,
      period1Value: formatMoney(period1.salesRevenue),
      period2Value: formatMoney(period2.salesRevenue),
      totalValue: formatMoney(total.salesRevenue),
      change: changes.salesRevenueChange,
      bgColor: "bg-blue-500/10",
      iconColor: "text-blue-600",
    },
    {
      title: "Валовая прибыль",
      icon: Package,
      period1Value: formatMoney(period1.grossProfit),
      period2Value: formatMoney(period2.grossProfit),
      totalValue: formatMoney(total.grossProfit),
      change: changes.grossProfitChange,
      subtitle: `Наценка: ${formatPercent(total.markup)}`,
      bgColor: "bg-purple-500/10",
      iconColor: "text-purple-600",
    },
    {
      title: "Итоговая маржа",
      icon: TrendingUp,
      period1Value: formatMoney(period1.netMargin),
      period2Value: formatMoney(period2.netMargin),
      totalValue: formatMoney(total.netMargin),
      change: changes.netMarginChange,
      bgColor: "bg-green-500/10",
      iconColor: "text-green-600",
    },
    {
      title: "Маржинальность",
      icon: Percent,
      period1Value: formatPercent(period1.marginPercent),
      period2Value: formatPercent(period2.marginPercent),
      totalValue: formatPercent(total.marginPercent),
      change: changes.marginPercentChange,
      changeUnit: "п.п.", // процентные пункты
      bgColor: "bg-orange-500/10",
      iconColor: "text-orange-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card key={index} className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              <span>{card.title}</span>
              <div className={`${card.bgColor} p-2 rounded-lg`}>
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Итого */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Итого</p>
              <p className="text-2xl font-bold">{card.totalValue}</p>
              {card.subtitle && (
                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
              )}
            </div>

            {/* Период 1 */}
            <div className="space-y-1 pt-2 border-t">
              <p className="text-xs text-muted-foreground">Период 1</p>
              <p className="text-sm font-semibold text-primary">{card.period1Value}</p>
            </div>

            {/* Период 2 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Период 2</p>
              <p className="text-sm font-semibold text-accent">{card.period2Value}</p>
            </div>

            {/* Изменение */}
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">Изменение</p>
              {renderChange(card.change)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
