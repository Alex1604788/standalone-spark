import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricTooltipProps {
  label: string;
  formula?: string;
  benchmark?: string;
  children?: React.ReactNode;
}

export function MetricTooltip({ label, formula, benchmark, children }: MetricTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help select-none w-fit">
          {children || <span>{label}</span>}
          <Info className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1 text-left">
        <p className="font-medium text-xs">{label}</p>
        {formula && (
          <p className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
            {formula}
          </p>
        )}
        {benchmark && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{benchmark}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
