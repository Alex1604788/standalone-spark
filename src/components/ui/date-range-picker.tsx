import * as React from "react";
import { format, subDays, startOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
  className?: string;
  align?: "start" | "center" | "end";
}

const presets = [
  {
    label: "Сегодня",
    getValue: () => ({ from: new Date(), to: new Date() }),
  },
  {
    label: "Вчера",
    getValue: () => {
      const yesterday = subDays(new Date(), 1);
      return { from: yesterday, to: yesterday };
    },
  },
  {
    label: "Текущая неделя",
    getValue: () => ({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: new Date(),
    }),
  },
  {
    label: "За 7 дней",
    getValue: () => ({
      from: subDays(new Date(), 6),
      to: new Date(),
    }),
  },
  {
    label: "За 30 дней",
    getValue: () => ({
      from: subDays(new Date(), 29),
      to: new Date(),
    }),
  },
  {
    label: "Текущий месяц",
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: new Date(),
    }),
  },
  {
    label: "Прошлый месяц",
    getValue: () => {
      const lastMonth = subMonths(new Date(), 1);
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      };
    },
  },
  {
    label: "За 90 дней",
    getValue: () => ({
      from: subDays(new Date(), 89),
      to: new Date(),
    }),
  },
];

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
  align = "start",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedRange, setSelectedRange] = React.useState<DateRange | undefined>({
    from: dateRange.start,
    to: dateRange.end,
  });

  React.useEffect(() => {
    setSelectedRange({
      from: dateRange.start,
      to: dateRange.end,
    });
  }, [dateRange.start, dateRange.end]);

  const handleSelect = (range: DateRange | undefined) => {
    setSelectedRange(range);
    if (range?.from && range?.to) {
      onDateRangeChange({ start: range.from, end: range.to });
    }
  };

  const handlePresetClick = (preset: (typeof presets)[0]) => {
    const range = preset.getValue();
    setSelectedRange(range);
    onDateRangeChange({ start: range.from, end: range.to });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !selectedRange && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedRange?.from ? (
            selectedRange.to ? (
              <>
                {format(selectedRange.from, "dd MMM yyyy", { locale: ru })} —{" "}
                {format(selectedRange.to, "dd MMM yyyy", { locale: ru })}
              </>
            ) : (
              format(selectedRange.from, "dd MMM yyyy", { locale: ru })
            )
          ) : (
            <span>Выберите период</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={selectedRange?.from}
            selected={selectedRange}
            onSelect={handleSelect}
            numberOfMonths={2}
            locale={ru}
            weekStartsOn={1}
            className="p-3 pointer-events-auto"
          />
          <div className="border-l p-3 flex flex-col gap-1 min-w-[140px]">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="justify-start text-sm font-normal h-8"
                onClick={() => handlePresetClick(preset)}
              >
                {preset.label}
              </Button>
            ))}
            <div className="mt-auto pt-2 border-t text-xs text-muted-foreground">
              Часовой пояс:<br />
              UTC+3, МСК
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
