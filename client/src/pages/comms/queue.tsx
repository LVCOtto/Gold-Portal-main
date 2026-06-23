import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Play, RotateCcw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CommsLayout } from "./layout";
import { format } from "date-fns";
import { Link } from "wouter";

interface QueueItem {
  id: string;
  externalJobId: string;
  state: string;
  dueAt: string;
  attempts: number;
  lastError: string | null;
  triggerType: string;
  triggeredBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-3xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy HH:mm");
}

export default function CommsQueuePage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: settings } = useQuery<{ manualMode: boolean }>({
    queryKey: ["/api/comms/settings"],
    queryFn: async () => {
      const res = await fetch("/api/comms/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const manualModeMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/comms/settings/manual-mode", { enabled }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({
        title: data.manualMode ? "Manual mode ON" : "Automation ON",
        description: data.manualMode
          ? "Automatic sends are paused. Only manually triggered updates will be sent."
          : "Automatic sends are now active.",
      });
      qc.invalidateQueries({ queryKey: ["/api/comms/settings"] });
    },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<Record<string, number>>({
    queryKey: ["/api/comms/queue/summary"],
    queryFn: async () => {
      const res = await fetch("/api/comms/queue/summary", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: dueData } = useQuery<{ items: QueueItem[]; dueCount: number }>({
    queryKey: ["/api/comms/queue/due"],
    queryFn: async () => {
      const res = await fetch("/api/comms/queue/due", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: failedItems } = useQuery<QueueItem[]>({
    queryKey: ["/api/comms/queue/failed"],
    queryFn: async () => {
      const res = await fetch("/api/comms/queue/failed", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: recentItems } = useQuery<QueueItem[]>({
    queryKey: ["/api/comms/queue/recent"],
    queryFn: async () => {
      const res = await fetch("/api/comms/queue/recent", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/comms/queue/run"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Worker run complete", description: `${data.processed} processed — ${data.sent} sent, ${data.failed} failed` });
      qc.invalidateQueries({ queryKey: ["/api/comms/queue"] });
    },
    onError: (err) => toast({ title: "Worker error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/comms/queue/retry/${id}`),
    onSuccess: () => { toast({ title: "Item re-queued" }); qc.invalidateQueries({ queryKey: ["/api/comms/queue"] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  return (
    <CommsLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Queue Monitor</h1>
            <p className="text-sm text-muted-foreground">Live view of the comms processing queue</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <Switch
                id="manual-mode"
                checked={settings?.manualMode ?? false}
                onCheckedChange={(v) => manualModeMutation.mutate(v)}
                disabled={manualModeMutation.isPending}
              />
              <Label htmlFor="manual-mode" className="text-sm font-medium cursor-pointer">
                Manual mode
              </Label>
            </div>
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className="gap-2">
              {runMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run worker now
            </Button>
          </div>
        </div>

        {settings?.manualMode && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <span className="font-semibold">Manual mode is ON.</span> Automated sends are paused — the queue worker will only process updates you trigger manually per job.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Due now" value={summary?.due ?? 0} color="text-yellow-600 dark:text-yellow-400" />
          <StatCard label="Processing" value={summary?.processing ?? 0} color="text-blue-600 dark:text-blue-400" />
          <StatCard label="Sent (all time)" value={summary?.sent ?? 0} color="text-green-600 dark:text-green-400" />
          <StatCard label="Failed" value={summary?.failed ?? 0} color="text-red-600 dark:text-red-400" />
          <StatCard label="Suppressed" value={summary?.suppressed ?? 0} />
        </div>

        {/* Due items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Due items ({dueData?.dueCount ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {!dueData?.items?.length ? (
              <p className="text-sm text-muted-foreground">No items currently due</p>
            ) : (
              <QueueTable items={dueData.items} />
            )}
          </CardContent>
        </Card>

        {/* Failed items */}
        {!!failedItems?.length && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-red-600">Failed ({failedItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {failedItems.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-3">
                    <div className="min-w-0">
                      <Link href={`/comms/jobs/${item.externalJobId}`} className="text-sm font-mono text-primary hover:underline">
                        {item.externalJobId}
                      </Link>
                      {item.lastError && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">{item.lastError}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">Attempt {item.attempts} · {fmtDate(item.updatedAt)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5 border-red-300"
                      onClick={() => retryMutation.mutate(item.id)}
                      disabled={retryMutation.isPending}
                    >
                      <RotateCcw className="h-3 w-3" />Retry
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recently sent */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recently sent (last 24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentItems?.length ? (
              <p className="text-sm text-muted-foreground">No recent sends</p>
            ) : (
              <QueueTable items={recentItems} />
            )}
          </CardContent>
        </Card>
      </div>
    </CommsLayout>
  );
}

function QueueTable({ items }: { items: QueueItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left pb-2 pr-4 font-medium">Job ID</th>
            <th className="text-left pb-2 pr-4 font-medium">State</th>
            <th className="text-left pb-2 pr-4 font-medium">Due at</th>
            <th className="text-left pb-2 pr-4 font-medium">Trigger</th>
            <th className="text-left pb-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-mono">
                <Link href={`/comms/jobs/${item.externalJobId}`} className="text-primary hover:underline">
                  {item.externalJobId}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  item.state === "sent" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                  item.state === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                  item.state === "due" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                  "bg-muted text-muted-foreground"
                }`}>{item.state}</span>
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{fmtDate(item.dueAt)}</td>
              <td className="py-2 pr-4 text-muted-foreground">{item.triggerType}</td>
              <td className="py-2 text-muted-foreground">{fmtDate(item.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
