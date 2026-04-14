import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";

interface PriorityBadgeProps {
  priority: string | null | undefined;
  className?: string;
}

const PRIORITY_STYLES: Record<string, { bg: string; icon: boolean }> = {
  gold: { bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: true },
  high: { bg: "bg-red-500/10 text-red-600 dark:text-red-400", icon: false },
  urgent: { bg: "bg-red-500/10 text-red-600 dark:text-red-400", icon: false },
  standard: { bg: "bg-muted text-muted-foreground", icon: false },
  normal: { bg: "bg-muted text-muted-foreground", icon: false },
  low: { bg: "bg-muted text-muted-foreground", icon: false },
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (!priority) return null;
  
  const normalized = priority.toLowerCase();
  const style = PRIORITY_STYLES[normalized] || { bg: "bg-muted text-muted-foreground", icon: false };
  
  return (
    <Badge 
      variant="secondary" 
      className={cn("gap-1 font-medium", style.bg, className)}
      data-testid={`badge-priority-${normalized}`}
    >
      {style.icon && <Star className="h-3 w-3 fill-current" />}
      {priority}
    </Badge>
  );
}
