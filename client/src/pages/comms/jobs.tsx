import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, PauseCircle, PlayCircle, Zap, StickyNote, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CommsLayout } from "./layout";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { Link } from "wouter";

interface JobEntry {
  externalJobId: string;
  clientName: string | null;
  accountCode: string | null;
  siteName: string | null;
  jobType: string | null;
  status: string | null;
  lastSyncedAt: string;
  state: {
    commsStatus: string;
    nextCommsDueAt: string | null;
    lastCommsSentAt: string | null;
    suppressionReason: string | null;
    escalationFlag: boolean;
  } | null;
}

function CommsBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    suppressed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    manual_hold: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[status] ?? variants.active}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function DueBadge({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) return <span className="text-xs text-muted-foreground">—</span>;
  const date = new Date(dueAt);
  const now = new Date();
  const isOverdue = isPast(date);
  const isDueSoon = !isOverdue && isWithinInterval(date, { start: now, end: addDays(now, 7) });

  return (
    <span className={`text-xs font-medium ${isOverdue ? "text-red-600 dark:text-red-400" : isDueSoon ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>
      {format(date, "dd/MM/yyyy")}
    </span>
  );
}

export default function CommsJobsPage() {
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

  const [search, setSearch] = useState("");
  const [commsStatusFilter, setCommsStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/comms/jobs", search, commsStatusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (commsStatusFilter !== "all") params.set("commsStatus", commsStatusFilter);
      const res = await fetch(`/api/comms/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json() as Promise<{ jobs: JobEntry[]; total: number }>;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/comms/jobs/${jobId}/trigger-update`),
    onSuccess: () => {
      toast({ title: "Update queued", description: "A comms update has been queued for immediate send." });
      qc.invalidateQueries({ queryKey: ["/api/comms/jobs"] });
    },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const suppressMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/comms/jobs/${jobId}/suppress`),
    onSuccess: () => { toast({ title: "Job suppressed" }); qc.invalidateQueries({ queryKey: ["/api/comms/jobs"] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/comms/jobs/${jobId}/resume`),
    onSuccess: () => { toast({ title: "Job resumed" }); qc.invalidateQueries({ queryKey: ["/api/comms/jobs"] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <CommsLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Job Board</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{total} jobs in comms queue</p>
          </div>
        </div>
        {settings?.manualMode && (
          <div className="flex items-center gap-2.5 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30 px-4 py-2.5">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <span className="font-semibold">Manual mode is ON</span> — automatic sends are paused. Toggle this off in the{" "}
              <Link href="/comms/queue" className="underline">Queue Monitor</Link>.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs, clients, sites..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={commsStatusFilter} onValueChange={(v) => { setCommsStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Comms status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="manual_hold">Manual hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Comms</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Next contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last sent</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin inline mr-2" />Loading…
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No jobs found</td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.externalJobId} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/comms/jobs/${job.externalJobId}`} className="text-primary hover:underline font-medium">
                          {job.externalJobId}
                        </Link>
                        {job.state?.escalationFlag && (
                          <span className="ml-1 text-red-500 text-xs font-bold">⚠</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">{job.clientName ?? job.accountCode ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{job.siteName ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{job.status ?? "—"}</td>
                      <td className="px-4 py-3">
                        <CommsBadge status={job.state?.commsStatus ?? "active"} />
                      </td>
                      <td className="px-4 py-3">
                        <DueBadge dueAt={job.state?.nextCommsDueAt ?? null} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {job.state?.lastCommsSentAt
                          ? format(new Date(job.state.lastCommsSentAt), "dd/MM/yyyy")
                          : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Send update now"
                            onClick={() => triggerMutation.mutate(job.externalJobId)}
                          >
                            <Zap className="h-3.5 w-3.5" />
                          </Button>
                          {job.state?.commsStatus === "suppressed" ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Resume comms"
                              onClick={() => resumeMutation.mutate(job.externalJobId)}
                            >
                              <PlayCircle className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Suppress comms"
                              onClick={() => suppressMutation.mutate(job.externalJobId)}
                            >
                              <PauseCircle className="h-3.5 w-3.5 text-yellow-600" />
                            </Button>
                          )}
                          <Link href={`/comms/jobs/${job.externalJobId}`}>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="View details">
                              <StickyNote className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages} — {total} total
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </CommsLayout>
  );
}
