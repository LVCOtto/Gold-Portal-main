import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export function DataCurrentBadge() {
  const { data } = useQuery<{ lastImport: string | null }>({
    queryKey: ["/api/system/last-import"],
    refetchInterval: 60000, // Refresh every minute
  });

  const lastImport = data?.lastImport ? new Date(data.lastImport) : null;

  return (
    <Badge variant="outline" className="gap-1.5 text-xs font-normal" data-testid="badge-data-current">
      <Clock className="h-3 w-3" />
      <span>
        Data current as of:{" "}
        {lastImport ? format(lastImport, "MMM d, yyyy h:mm a") : "No imports yet"}
      </span>
    </Badge>
  );
}
