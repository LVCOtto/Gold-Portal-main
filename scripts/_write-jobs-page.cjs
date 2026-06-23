const fs = require("fs");
const path = require("path");

const content = `import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, RefreshCw, PauseCircle, PlayCircle, Zap, StickyNote, AlertCircle,
  Play, RotateCcw, Settings2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CommsLayout } from "./layout";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────

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
  lastAction: {
    outcome: string;
    triggerType: string;
    sentAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  } | null;
}

interface QueueItem {
  id: string;
  externalJobId: string;
  state: string;
  dueAt: string;
  attempts: number;
  lastError: string | null;
  triggerType: string;
  triggeredBy: string | null;
  updatedAt: string;
}

// ── Small components ───────────────────────────────────────────────────────

function CommsBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    suppressed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    manual_hold: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={\`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium \${variants[status] ?? variants.active}\`}>
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
    <span className={\`text-xs font-medium \${isOverdue ? "text-red-600 dark:text-red-400" : isDueSoon ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}\`}>
      {format(date, "dd/MM/yyyy")}
    </span>
  );
}

function LastActionBadge({ action }: { action: JobEntry["lastAction"] }) {
  if (!action) return <span className="text-xs text-muted-foreground">—</span>;
  const colorClass =
    action.outcome === "sent" ? "text-green-700 dark:text-green-400"
    : action.outcome === "failed" ? "text-red-700 dark:text-red-400"
    : action.outcome === "suppressed" ? "text-yellow-700 dark:text-yellow-400"
    : "text-muted-foreground";
  const stamp = action.sentAt ?? action.completedAt;
  return (
    <div className="space-y-0.5">
      <div className={\`text-xs font-medium \${colorClass}\`}>{action.outcome}</div>
      <div className="text-[11px] text-muted-foreground">
        {action.triggerType}{stamp ? \` · \${format(new Date(stamp), "dd/MM HH:mm")}\` : ""}
      </div>
      {action.outcome === "failed" && action.errorMessage && (
        <div className="text-[10px] text-red-600 dark:text-red-400 truncate max-w-[170px]" title={action.errorMessage}>
          {action.errorMessage}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number | undefined; color?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
      <span className={\`text-xl font-bold \${color ?? "text-foreground"}\`}>{value ?? "—"}</span>
      <span className="text-xs text-muted-foreground leading-tight">{label}</span>
    </div>
  );
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return format(new Date(d), "dd/MM/yyyy HH:mm");
}

// ── localStorage helpers ───────────────────────────────────────────────────

const LS_KEY = "comms_jobs_filters_v1";

function loadPersistedFilters() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { search: "", jobTypeContains: "", commsStatusFilter: "all" };
    return JSON.parse(raw) as { search: string; jobTypeContains: string; commsStatusFilter: string };
  } catch {
    return { search: "", jobTypeContains: "", commsStatusFilter: "all" };
  }
}

function persistFilters(f: { search: string; jobTypeContains: string; commsStatusFilter: string }) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function CommsJobsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filtersReady, setFiltersReady] = useState(false);
  const [search, setSearch] = useState("");
  const [jobTypeContains, setJobTypeContains] = useState("");
  const [commsStatusFilter, setCommsStatusFilter] = useState("all");

  useEffect(() => {
    const saved = loadPersistedFilters();
    setSearch(saved.search);
    setJobTypeContains(saved.jobTypeContains);
    setCommsStatusFilter(saved.commsStatusFilter);
    setFiltersReady(true);
  }, []);

  function updateSearch(v: string) { setSearch(v); setPage(1); persistFilters({ search: v, jobTypeContains, commsStatusFilter }); }
  function updateJobType(v: string) { setJobTypeContains(v); setPage(1); persistFilters({ search, jobTypeContains: v, commsStatusFilter }); }
  function updateCommsStatus(v: string) { setCommsStatusFilter(v); setPage(1); persistFilters({ search, jobTypeContains, commsStatusFilter: v }); }

  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [showAllowlist, setShowAllowlist] = useState(false);
  const [allowlistDraft, setAllowlistDraft] = useState("");
  const [showFailed, setShowFailed] = useState(true);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: settings } = useQuery<{ manualMode: boolean }>({
    queryKey: ["/api/comms/settings"],
    queryFn: async () => {
      const res = await fetch("/api/comms/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: allowlistData } = useQuery<{ allowlist: string[] }>({
    queryKey: ["/api/comms/settings/job-type-allowlist"],
    queryFn: async () => {
      const res = await fetch("/api/comms/settings/job-type-allowlist", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const allowlist = allowlistData?.allowlist ?? [];

  useEffect(() => {
    if (allowlistData) setAllowlistDraft(allowlistData.allowlist.join(", "));
  }, [allowlistData]);

  const { data: summary } = useQuery<Record<string, number>>({
    queryKey: ["/api/comms/queue/summary"],
    queryFn: async () => {
      const res = await fetch("/api/comms/queue/summary", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 20000,
  });

  const { data: failedItems } = useQuery<QueueItem[]>({
    queryKey: ["/api/comms/queue/failed"],
    queryFn: async () => {
      const res = await fetch("/api/comms/queue/failed", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 20000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["/api/comms/jobs", search, jobTypeContains, commsStatusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set("search", search);
      if (jobTypeContains) params.set("jobTypeContains", jobTypeContains);
      if (commsStatusFilter !== "all") params.set("commsStatus", commsStatusFilter);
      const res = await fetch(\`/api/comms/jobs?\${params}\`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json() as Promise<{ jobs: JobEntry[]; total: number }>;
    },
    enabled: filtersReady,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const manualModeMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/comms/settings/manual-mode", { enabled }),
    onSuccess: async (res) => {
      const d = await res.json();
      toast({
        title: d.manualMode ? "Manual mode ON" : "Automation ON",
        description: d.manualMode
          ? "Automatic sends are paused — only manually triggered updates will be sent."
          : "Automatic sends are now active.",
      });
      qc.invalidateQueries({ queryKey: ["/api/comms/settings"] });
    },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/comms/queue/run"),
    onSuccess: async (res) => {
      const d = await res.json();
      toast({
        title: "Worker run complete",
        description: \`\${d.processed} processed — \${d.sent} sent, \${d.failed} failed\${d.skippedAllowlist ? \`, \${d.skippedAllowlist} skipped (allowlist)\` : ""}\`,
      });
      qc.invalidateQueries({ queryKey: ["/api/comms/queue"] });
      qc.invalidateQueries({ queryKey: ["/api/comms/jobs"] });
    },
    onError: (err) => toast({ title: "Worker error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const triggerMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", \`/api/comms/jobs/\${jobId}/trigger-update?runNow=1\`);
      return res.json() as Promise<{
        queued: boolean;
        queueItemId: string;
        note?: string;
        worker?: { sent: number; failed: number; suppressed: number; processed: number; skippedAllowlist?: number } | null;
      }>;
    },
    onSuccess: (result) => {
      if (result.worker?.sent) {
        toast({ title: "Update sent", description: "The update was sent immediately." });
      } else if (result.worker?.skippedAllowlist) {
        toast({ title: "Blocked by allowlist", description: "This job's type is not in the auto-comms allowlist. Update queued but not sent.", variant: "destructive" });
      } else if (result.worker?.failed) {
        toast({ title: "Send failed", description: "Delivery failed. Check Audit for details.", variant: "destructive" });
      } else if (result.note === "already queued") {
        toast({ title: "Already queued", description: "An update was already due and has been processed." });
      } else {
        toast({ title: "Update queued", description: "The update is queued and will be processed by the worker." });
      }
      qc.invalidateQueries({ queryKey: ["/api/comms/jobs"] });
      qc.invalidateQueries({ queryKey: ["/api/comms/queue"] });
    },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const suppressMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", \`/api/comms/jobs/\${jobId}/suppress\`),
    onSuccess: () => { toast({ title: "Job suppressed" }); qc.invalidateQueries({ queryKey: ["/api/comms/jobs"] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", \`/api/comms/jobs/\${jobId}/resume\`),
    onSuccess: () => { toast({ title: "Job resumed" }); qc.invalidateQueries({ queryKey: ["/api/comms/jobs"] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", \`/api/comms/queue/retry/\${id}\`),
    onSuccess: () => { toast({ title: "Item re-queued" }); qc.invalidateQueries({ queryKey: ["/api/comms/queue"] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const allowlistMutation = useMutation({
    mutationFn: (phrases: string[]) => apiRequest("POST", "/api/comms/settings/job-type-allowlist", { allowlist: phrases }),
    onSuccess: () => {
      toast({ title: "Allowlist saved" });
      qc.invalidateQueries({ queryKey: ["/api/comms/settings/job-type-allowlist"] });
    },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  function saveAllowlist() {
    const phrases = allowlistDraft.split(",").map((s) => s.trim()).filter(Boolean);
    allowlistMutation.mutate(phrases);
  }

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const failedCount = failedItems?.length ?? 0;

  return (
    <CommsLayout>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Comms</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{total} jobs · queue: {summary?.due ?? 0} due</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                id="manual-mode"
                checked={settings?.manualMode ?? false}
                onCheckedChange={(v) => manualModeMutation.mutate(v)}
                disabled={manualModeMutation.isPending}
              />
              <Label htmlFor="manual-mode" className="text-sm font-medium cursor-pointer">Manual mode</Label>
            </div>
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} size="sm" className="gap-2">
              {runMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run worker now
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-2">
          <StatPill label="Due now" value={summary?.due} color="text-yellow-600 dark:text-yellow-400" />
          <StatPill label="Processing" value={summary?.processing} color="text-blue-600 dark:text-blue-400" />
          <StatPill label="Sent (all time)" value={summary?.sent} color="text-green-600 dark:text-green-400" />
          <StatPill label="Failed" value={summary?.failed} color="text-red-600 dark:text-red-400" />
          <StatPill label="Suppressed" value={summary?.suppressed} />
        </div>

        {/* Banners */}
        {settings?.manualMode && (
          <div className="flex items-center gap-2.5 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30 px-4 py-2.5">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <span className="font-semibold">Manual mode is ON</span> — automatic sends are paused. Use the toggle above to enable automation.
            </p>
          </div>
        )}
        {allowlist.length > 0 && (
          <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-4 py-2.5">
            <Settings2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <span className="font-semibold">Job type allowlist active</span> — auto comms only run for: <span className="font-mono">{allowlist.join(", ")}</span>
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search jobs, clients, sites…" value={search} onChange={(e) => updateSearch(e.target.value)} className="pl-9" />
            </div>
            <Input
              placeholder="Job type contains (comma-separated phrases)"
              value={jobTypeContains}
              onChange={(e) => updateJobType(e.target.value)}
              className="flex-1 min-w-[220px] max-w-sm"
            />
            <Select value={commsStatusFilter} onValueChange={updateCommsStatus}>
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
            <Button variant="outline" size="sm" className="gap-1.5 self-start sm:self-auto" onClick={() => setShowAllowlist((v) => !v)}>
              <Settings2 className="h-3.5 w-3.5" />
              Allowlist {showAllowlist ? "▲" : "▼"}
            </Button>
          </div>

          {showAllowlist && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div>
                <p className="text-sm font-medium mb-0.5">Auto-comms job type allowlist</p>
                <p className="text-xs text-muted-foreground">
                  Comma-separated phrases. Auto comms only run for jobs whose Job Type contains at least one phrase.{" "}
                  <strong>Leave empty to include all job types.</strong> Manual sends always bypass this check.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Input
                  className="flex-1 min-w-[260px] font-mono text-sm"
                  placeholder="e.g. maintenance, reactive, service"
                  value={allowlistDraft}
                  onChange={(e) => setAllowlistDraft(e.target.value)}
                />
                <Button size="sm" onClick={saveAllowlist} disabled={allowlistMutation.isPending}>
                  {allowlistMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Save allowlist
                </Button>
                {allowlist.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => { setAllowlistDraft(""); allowlistMutation.mutate([]); }}>
                    Clear (allow all)
                  </Button>
                )}
              </div>
              {allowlist.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {allowlist.map((p) => (
                    <span key={p} className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-mono">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Job table */}
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Site</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Comms</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Next contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last sent</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last action</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin inline mr-2" />Loading…
                  </td></tr>
                ) : jobs.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No jobs found</td></tr>
                ) : jobs.map((job) => (
                  <tr key={job.externalJobId} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={\`/comms/jobs/\${job.externalJobId}\`} className="text-primary hover:underline font-medium">
                        {job.externalJobId}
                      </Link>
                      {job.state?.escalationFlag && <span className="ml-1 text-red-500 font-bold">⚠</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{job.clientName ?? job.accountCode ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{job.siteName ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {job.jobType
                        ? (allowlist.length > 0 && !allowlist.some((p) => job.jobType!.toLowerCase().includes(p.toLowerCase()))
                            ? <span title="Not in allowlist — auto comms blocked" className="opacity-50 line-through">{job.jobType}</span>
                            : job.jobType)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{job.status ?? "—"}</td>
                    <td className="px-4 py-3"><CommsBadge status={job.state?.commsStatus ?? "active"} /></td>
                    <td className="px-4 py-3"><DueBadge dueAt={job.state?.nextCommsDueAt ?? null} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {job.state?.lastCommsSentAt ? format(new Date(job.state.lastCommsSentAt), "dd/MM/yyyy") : "Never"}
                    </td>
                    <td className="px-4 py-3"><LastActionBadge action={job.lastAction} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Send update now" onClick={() => triggerMutation.mutate(job.externalJobId)} disabled={triggerMutation.isPending}>
                          <Zap className="h-3.5 w-3.5" />
                        </Button>
                        {job.state?.commsStatus === "suppressed" ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Resume comms" onClick={() => resumeMutation.mutate(job.externalJobId)}>
                            <PlayCircle className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Suppress comms" onClick={() => suppressMutation.mutate(job.externalJobId)}>
                            <PauseCircle className="h-3.5 w-3.5 text-yellow-600" />
                          </Button>
                        )}
                        <Link href={\`/comms/jobs/\${job.externalJobId}\`}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="View details">
                            <StickyNote className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages} — {total} total</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </div>

        {/* Failed queue items */}
        {failedCount > 0 && (
          <div className="border border-red-200 dark:border-red-900 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-red-50 dark:bg-red-950/20 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
              onClick={() => setShowFailed((v) => !v)}
            >
              <span>Failed queue items ({failedCount}) — click to expand / retry</span>
              {showFailed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showFailed && (
              <div className="divide-y divide-red-100 dark:divide-red-900/50">
                {failedItems?.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 bg-card">
                    <div className="min-w-0">
                      <Link href={\`/comms/jobs/\${item.externalJobId}\`} className="text-sm font-mono text-primary hover:underline">
                        {item.externalJobId}
                      </Link>
                      {item.lastError && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate max-w-[400px]">{item.lastError}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Attempt {item.attempts} · {fmtDateTime(item.updatedAt)} · {item.triggerType}
                      </p>
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
            )}
          </div>
        )}

      </div>
    </CommsLayout>
  );
}
`;

fs.writeFileSync(path.join(__dirname, "../client/src/pages/comms/jobs.tsx"), content, "utf8");
console.log("Written jobs.tsx");
