import { useState } from "react";
import { Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  // Форматирование даты для input[type="date"]
  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toISOString().split("T")[0];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Выбор периодов для сравнения
        </CardTitle>
        <CardDescription>
          Сравните продажи и маржинальность товаров за два периода
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Период 1 */}
          <div className="space-y-4">
            <h3 className="font-semibold text-primary">Период 1</h3>
            <div className="space-y-2">
              <Label htmlFor="period1-start">Дата начала</Label>
              <Input
                id="period1-start"
                type="date"
                value={formatDate(period1.startDate)}
                onChange={(e) =>
                  onPeriod1Change({
                    ...period1,
                    startDate: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period1-end">Дата окончания</Label>
              <Input
                id="period1-end"
                type="date"
                value={formatDate(period1.endDate)}
                onChange={(e) =>
                  onPeriod1Change({
                    ...period1,
                    endDate: e.target.value,
                  })
                }
              />
            </div>
          </div>

          {/* Период 2 */}
          <div className="space-y-4">
            <h3 className="font-semibold text-accent">Период 2</h3>
            <div className="space-y-2">
              <Label htmlFor="period2-start">Дата начала</Label>
              <Input
                id="period2-start"
                type="date"
                value={formatDate(period2.startDate)}
                onChange={(e) =>
                  onPeriod2Change({
                    ...period2,
                    startDate: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period2-end">Дата окончания</Label>
              <Input
                id="period2-end"
                type="date"
                value={formatDate(period2.endDate)}
                onChange={(e) =>
                  onPeriod2Change({
                    ...period2,
                    endDate: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onApply}>
            Применить фильтр
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
