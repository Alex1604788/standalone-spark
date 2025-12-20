import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpIconProps {
  content: string | React.ReactNode;
  className?: string;
}

export function HelpIcon({ content, className = "" }: HelpIconProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors ${className}`}
            onClick={(e) => e.preventDefault()}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-sm whitespace-pre-line">{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}



