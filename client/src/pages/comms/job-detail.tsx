import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Zap, PauseCircle, PlayCircle, StickyNote, AlertTriangle,
  RefreshCw, Send, Clock, User, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CommsLayout } from "./layout";
import { format } from "date-fns";

interface JobDetail {
  snapshot: {
    externalJobId: string;
    clientName: string | null;
    accountCode: string | null;
    siteName: string | null;
    jobType: string | null;
    status: string | null;
    priority: string | null;
    shortDescription: string | null;
    engineerName: string | null;
    lastVisitDate: string | null;
    nextActionDueDate: string | null;
    lastSyncedAt: string;
  };
  state: {
    commsStatus: string;
    nextCommsDueAt: string | null;
    lastCommsSentAt: string | null;
    suppressedAt: string | null;
    suppressionReason: string | null;
    escalationFlag: boolean;
    assignedOperator: string | null;
    templateOverrideKey: string | null;
    cooldownDaysOverride: number | null;
    internalTags: string | null;
    lastManualActionAt: string | null;
    lastManualActionBy: string | null;
  };
  notes: Array<{ id: string; note: string; createdBy: string; createdAt: string }>;
}

interface AuditEntry {
  id: string;
  triggerType: string;
  templateId: string | null;
  renderedSubject: string | null;
  renderedBody: string | null;
  recipientEmail: string | null;
  outcome: string;
  errorMessage: string | null;
  operatorId: string | null;
  sentAt: string | null;
  createdAt: string;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return format(new Date(d), "dd MMM yyyy HH:mm");
}

export default function CommsJobDetailPage() {
  const [, params] = useRoute("/comms/jobs/:jobId");
  const jobId = params?.jobId ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [noteText, setNoteText] = useState("");
  const [cooldownOverride, setCooldownOverride] = useState<string>("");
  const [templateOverride, setTemplateOverride] = useState<string>("");
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);

  const { data, isLoading } = useQuery<JobDetail>({
    queryKey: [`/api/comms/jobs/${jobId}`],
    queryFn: async () => {
      const res = await fetch(`/api/comms/jobs/${jobId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load job");
      return res.json();
    },
    enabled: !!jobId,
  });

  const { data: auditData } = useQuery<AuditEntry[]>({
    queryKey: [`/api/comms/jobs/${jobId}/comms`],
    queryFn: async () => {
      const res = await fetch(`/api/comms/jobs/${jobId}/comms`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load comms history");
      return res.json();
    },
    enabled: !!jobId,
  });

  const triggerMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/jobs/${jobId}/trigger-update`),
    onSuccess: () => { toast({ title: "Update queued" }); qc.invalidateQueries({ queryKey: [`/api/comms/jobs/${jobId}`] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const suppressMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/jobs/${jobId}/suppress`),
    onSuccess: () => { toast({ title: "Job suppressed" }); qc.invalidateQueries({ queryKey: [`/api/comms/jobs/${jobId}`] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/comms/jobs/${jobId}/resume`),
    onSuccess: () => { toast({ title: "Job resumed" }); qc.invalidateQueries({ queryKey: [`/api/comms/jobs/${jobId}`] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const noteMutation = useMutation({
    mutationFn: (note: string) => apiRequest("POST", `/api/comms/jobs/${jobId}/note`, { note }),
    onSuccess: () => { toast({ title: "Note added" }); setNoteText(""); qc.invalidateQueries({ queryKey: [`/api/comms/jobs/${jobId}`] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const patchStateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiRequest("PATCH", `/api/comms/jobs/${jobId}/state`, patch),
    onSuccess: () => { toast({ title: "State updated" }); qc.invalidateQueries({ queryKey: [`/api/comms/jobs/${jobId}`] }); },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <CommsLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />Loading…
        </div>
      </CommsLayout>
    );
  }

  if (!data) {
    return (
      <CommsLayout>
        <div className="py-20 text-center text-muted-foreground">Job not found.</div>
      </CommsLayout>
    );
  }

  const { snapshot, state, notes } = data;

  return (
    <CommsLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/comms/jobs">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground font-mono">{jobId}</h1>
            <p className="text-sm text-muted-foreground">{snapshot.siteName ?? "—"}</p>
          </div>
          {state.escalationFlag && (
            <Badge variant="destructive" className="gap-1 ml-auto">
              <AlertTriangle className="h-3 w-3" />Escalated
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Job data */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Job Data (Protean)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                {[
                  ["Client", snapshot.clientName ?? snapshot.accountCode],
                  ["Site", snapshot.siteName],
                  ["Job type", snapshot.jobType],
                  ["Status", snapshot.status],
                  ["Priority", snapshot.priority],
                  ["Engineer", snapshot.engineerName],
                  ["Last visit", fmtDate(snapshot.lastVisitDate)],
                  ["Next action due", fmtDate(snapshot.nextActionDueDate)],
                  ["Last synced", fmtDate(snapshot.lastSyncedAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-foreground">{value ?? "—"}</p>
                  </div>
                ))}
                {snapshot.shortDescription && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-foreground">{snapshot.shortDescription}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs: notes + comms history */}
            <Tabs defaultValue="notes">
              <TabsList>
                <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
                <TabsTrigger value="history">Comms history ({auditData?.length ?? 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="notes" className="space-y-3 mt-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add an internal note…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="resize-none"
                    rows={2}
                  />
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => noteMutation.mutate(noteText)}
                    disabled={!noteText.trim() || noteMutation.isPending}
                  >
                    <StickyNote className="h-4 w-4 mr-1" />Add
                  </Button>
                </div>
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No notes yet</p>
                ) : (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <p className="text-foreground whitespace-pre-wrap">{note.note}</p>
                        <p className="text-xs text-muted-foreground mt-1">{note.createdBy} · {fmtDate(note.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-3">
                {!auditData || auditData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No comms history yet</p>
                ) : (
                  <div className="space-y-2">
                    {auditData.map((entry) => (
                      <div key={entry.id} className="rounded-lg border bg-card p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              entry.outcome === "sent" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                              entry.outcome === "failed" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                              "bg-muted text-muted-foreground"
                            }`}>{entry.outcome}</span>
                            <span className="text-xs text-muted-foreground">{entry.triggerType}</span>
                            {entry.templateId && <span className="text-xs text-muted-foreground">· {entry.templateId}</span>}
                          </div>
                          <span className="text-xs text-muted-foreground">{fmtDate(entry.createdAt)}</span>
                        </div>
                        {entry.renderedSubject && (
                          <p className="text-sm font-medium mt-2">{entry.renderedSubject}</p>
                        )}
                        {entry.errorMessage && (
                          <p className="text-xs text-red-600 mt-1">{entry.errorMessage}</p>
                        )}
                        {entry.renderedBody && (
                          <button
                            className="text-xs text-primary mt-1 hover:underline"
                            onClick={() => setExpandedAudit(expandedAudit === entry.id ? null : entry.id)}
                          >
                            {expandedAudit === entry.id ? "Hide body" : "Show body"}
                          </button>
                        )}
                        {expandedAudit === entry.id && entry.renderedBody && (
                          <pre className="text-xs mt-2 bg-muted p-3 rounded whitespace-pre-wrap font-sans text-muted-foreground">
                            {entry.renderedBody}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Comms control */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Comms Control</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-medium ${
                    state.commsStatus === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                    state.commsStatus === "suppressed" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{state.commsStatus.replace(/_/g, " ")}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Next contact due</p>
                    <p className="text-foreground font-medium">{fmtDate(state.nextCommsDueAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Last sent</p>
                    <p className="text-foreground">{fmtDate(state.lastCommsSentAt)}</p>
                  </div>
                </div>

                {state.suppressionReason && (
                  <div className="text-sm bg-red-50 dark:bg-red-950/20 rounded p-2 text-red-700 dark:text-red-400">
                    Suppressed: {state.suppressionReason}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => triggerMutation.mutate()}
                    disabled={triggerMutation.isPending}
                  >
                    <Zap className="h-3.5 w-3.5" />Send now
                  </Button>
                  {state.commsStatus === "suppressed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-green-600 border-green-300"
                      onClick={() => resumeMutation.mutate()}
                      disabled={resumeMutation.isPending}
                    >
                      <PlayCircle className="h-3.5 w-3.5" />Resume
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-yellow-600 border-yellow-300"
                      onClick={() => suppressMutation.mutate()}
                      disabled={suppressMutation.isPending}
                    >
                      <PauseCircle className="h-3.5 w-3.5" />Suppress
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Escalation flag</Label>
                  <Switch
                    checked={state.escalationFlag}
                    onCheckedChange={(v) => patchStateMutation.mutate({ escalationFlag: v })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Cooldown override (days)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      placeholder={`Default (7)`}
                      value={cooldownOverride}
                      onChange={(e) => setCooldownOverride(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => {
                        const v = cooldownOverride ? Number(cooldownOverride) : null;
                        patchStateMutation.mutate({ cooldownDaysOverride: v });
                        setCooldownOverride("");
                      }}
                    >
                      Set
                    </Button>
                  </div>
                  {state.cooldownDaysOverride && (
                    <p className="text-xs text-muted-foreground">Current: {state.cooldownDaysOverride} days</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Template override key</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. escalated"
                      value={templateOverride}
                      onChange={(e) => setTemplateOverride(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => {
                        patchStateMutation.mutate({ templateOverrideKey: templateOverride || null });
                        setTemplateOverride("");
                      }}
                    >
                      Set
                    </Button>
                  </div>
                  {state.templateOverrideKey && (
                    <p className="text-xs text-muted-foreground">Current: {state.templateOverrideKey}</p>
                  )}
                </div>

                {(state.lastManualActionAt || state.lastManualActionBy) && (
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    Last action by {state.lastManualActionBy} · {fmtDate(state.lastManualActionAt)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </CommsLayout>
  );
}
