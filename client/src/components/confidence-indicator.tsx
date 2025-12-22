import { Info, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ConfidenceIndicatorProps {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ConfidenceIndicator({ 
  score, 
  showLabel = true, 
  size = "md" 
}: ConfidenceIndicatorProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  
  const getConfig = () => {
    if (clampedScore >= 80) {
      return {
        icon: CheckCircle,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        label: "High Confidence",
        description: "This data has been verified by multiple users",
      };
    }
    if (clampedScore >= 60) {
      return {
        icon: AlertTriangle,
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        label: "Medium Confidence",
        description: "Some verification needed - data may be outdated",
      };
    }
    return {
      icon: AlertCircle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      label: "Low Confidence",
      description: "Pioneer data - please verify with official sources",
    };
  };

  const config = getConfig();
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: { icon: "w-3.5 h-3.5", text: "text-xs", padding: "px-2 py-1" },
    md: { icon: "w-4 h-4", text: "text-sm", padding: "px-3 py-1.5" },
    lg: { icon: "w-5 h-5", text: "text-base", padding: "px-4 py-2" },
  };

  const sizes = sizeClasses[size];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full ${config.bgColor} ${sizes.padding} cursor-help`}
          data-testid="confidence-indicator"
        >
          <Icon className={`${sizes.icon} ${config.color}`} />
          {showLabel && (
            <span className={`${sizes.text} font-medium ${config.color}`}>
              {clampedScore}%
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-semibold">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
