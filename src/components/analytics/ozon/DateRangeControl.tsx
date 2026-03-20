import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  { label: "Сегодня", days: 0 },
  { label: "7 дней", days: 7 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
];

interface DateRangeControlProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

export function DateRangeControl({ dateFrom, dateTo, onChange }: DateRangeControlProps) {
  const today = new Date().toISOString().split("T")[0];

  // Определяем активный пресет
  const activePreset = PRESETS.find(
    (p) => p.days === 0 ? dateFrom === today : dateFrom === daysAgo(p.days)
  )?.days ?? -1;

  const [customFrom, setCustomFrom] = useState(dateFrom);
  const [customTo, setCustomTo] = useState(dateTo);

  const handlePreset = (days: number) => {
    const from = days === 0 ? today : daysAgo(days);
    onChange(from, today);
  };

  const handleCustomApply = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      onChange(customFrom, customTo);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESETS.map((p) => (
        <Button
          key={p.days}
          variant={activePreset === p.days ? "default" : "outline"}
          size="sm"
          onClick={() => handlePreset(p.days)}
          className="h-8 text-xs"
        >
          {p.label}
        </Button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={activePreset === -1 ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs gap-1.5"
          >
            <CalendarDays className="w-3 h-3" />
            {activePreset === -1 ? `${dateFrom} — ${dateTo}` : "Период"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-3" align="end">
          <div className="space-y-1">
            <Label className="text-xs">С</Label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">По</Label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              max={today}
              className="h-8 text-xs"
            />
          </div>
          <Button size="sm" className="w-full h-8 text-xs" onClick={handleCustomApply}>
            Применить
          </Button>
        </PopoverContent>
      </Popover>

      <span className="text-xs text-muted-foreground ml-1">
        {dateFrom} — {dateTo}
      </span>
    </div>
  );
}
