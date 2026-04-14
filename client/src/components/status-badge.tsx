import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  showRaw?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  attended: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  attended_in_processing: "bg-primary/10 text-primary dark:bg-primary/20",
  pending_engineer_visit: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  pending_visit: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  awaiting_parts_for_repair: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  workshop_repair: "bg-primary/10 text-primary dark:bg-primary/20",

  open: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  awaiting_approval: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  pending_approval: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  quote_sent: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  
  awaiting_parts: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  parts_ordered: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  parts_on_order: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  
  in_progress: "bg-primary/10 text-primary dark:bg-primary/20",
  scheduled: "bg-primary/10 text-primary dark:bg-primary/20",
  engineer_assigned: "bg-primary/10 text-primary dark:bg-primary/20",
  work_in_progress: "bg-primary/10 text-primary dark:bg-primary/20",
  approved_pending_internal_processing: "bg-primary/10 text-primary dark:bg-primary/20",
  
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  invoiced: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  
  on_hold: "bg-muted text-muted-foreground",
  delayed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  rejected: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  awaiting_approval: "Awaiting Approval",
  pending_approval: "Pending Approval",
  quote_sent: "Quote Sent",
  awaiting_parts: "Awaiting Parts",
  parts_ordered: "Parts Ordered",
  parts_on_order: "Parts On Order",
  in_progress: "In Progress",
  scheduled: "Scheduled",
  engineer_assigned: "Engineer Assigned",
  work_in_progress: "Work In Progress",
  approved_pending_internal_processing: "Approved - Processing",
  completed: "Completed",
  closed: "Closed",
  invoiced: "Invoiced",
  approved: "Approved",
  on_hold: "On Hold",
  delayed: "Delayed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export function StatusBadge({ status, showRaw = false, className }: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/[\s-]+/g, "_");
  const colorClass = STATUS_COLORS[normalized] || "bg-secondary text-secondary-foreground";
  const label = STATUS_LABELS[normalized] || status;

  return (
    <Badge 
      variant="secondary" 
      className={cn("font-medium", colorClass, className)}
      data-testid={`badge-status-${normalized}`}
    >
      {label}
      {showRaw && normalized !== status.toLowerCase() && (
        <span className="ml-1 opacity-60">({status})</span>
      )}
    </Badge>
  );
}
