import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { CalendarDays } from "lucide-react";

export interface Period {
  startDate: string;
  endDate: string;
}

interface PeriodSelectorProps {
  period1: Period;
  period2: Period;
  onPeriod1Change: (period: Period) => void;
  onPeriod2Change: (period: Period) => void;
  onApply: () => void;
}

export const PeriodSelector = ({
  period1,
  period2,
  onPeriod1Change,
  onPeriod2Change,
  onApply,
}: PeriodSelectorProps) => {
  const parseDateRange = (period: Period) => ({
    start: period.startDate ? new Date(period.startDate) : new Date(),
    end: period.endDate ? new Date(period.endDate) : new Date(),
  });

  const handlePeriod1Change = (range: { start: Date; end: Date }) => {
    onPeriod1Change({
      startDate: range.start.toISOString().split("T")[0],
      endDate: range.end.toISOString().split("T")[0],
    });
  };

  const handlePeriod2Change = (range: { start: Date; end: Date }) => {
    onPeriod2Change({
      startDate: range.start.toISOString().split("T")[0],
      endDate: range.end.toISOString().split("T")[0],
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5" />
          Выбор периодов для сравнения
        </CardTitle>
        <CardDescription>
          Сравните продажи и маржинальность товаров за два периода
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-primary">Период 1</h3>
            <DateRangePicker
              dateRange={parseDateRange(period1)}
              onDateRangeChange={handlePeriod1Change}
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-accent-foreground">Период 2</h3>
            <DateRangePicker
              dateRange={parseDateRange(period2)}
              onDateRangeChange={handlePeriod2Change}
            />
          </div>

          <Button onClick={onApply}>
            Применить фильтр
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
