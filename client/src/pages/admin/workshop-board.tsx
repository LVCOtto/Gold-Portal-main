import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, Loader2, Mail, MoveRight, PackageSearch, ShieldAlert, Wrench } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { WorkshopLayout } from "@/components/workshop-layout";

type WorkshopSettings = {
  workshopEmailDemoModeEnabled: boolean;
  workshopEmailDemoRecipient: string;
};

type WorkshopLane = "entry" | "booked_in" | "on_the_bench" | "quoted" | "awaiting_parts" | "repair_completed";

type WorkshopBoardResponseItem = {
  card: {
    jobId: string;
    boardLane: WorkshopLane;
    laneOrder: number;
    sourceStatusAtLastSync: string | null;
    sourceJobType: string | null;
    lastEmailSentAt: string | null;
    lastEmailOutcome: string | null;
    partsEtaOverride: string | null;
    updatedAt: string;
  };
  job: {
    jobId: string;
    accountCode: string;
    siteName: string;
    status: string;
    sourcePortalStatus: string | null;
    jobType: string | null;
    shortDescription: string;
    engineerName: string | null;
    dueDate: string | null;
    equipment: string | null;
  } | null;
  accountName: string | null;
};

type PendingMove = {
  item: WorkshopBoardResponseItem;
  lane: WorkshopLane;
};

const laneConfig: Array<{ key: WorkshopLane; label: string; description: string }> = [
  { key: "entry", label: "Entry", description: "Created in system, not yet fully processed into workshop flow." },
  { key: "booked_in", label: "Booked In", description: "Arrived and acknowledged by the workshop team." },
  { key: "on_the_bench", label: "On The Bench", description: "Actively being assessed or repaired by the team." },
  { key: "quoted", label: "Quoted", description: "Quotation or approval point reached." },
  { key: "awaiting_parts", label: "Awaiting Parts", description: "Waiting on parts before work can continue." },
  { key: "repair_completed", label: "Repair Completed", description: "Ready for collection, dispatch, or return to site." },
];

const laneAccentClass: Record<WorkshopLane, { stripe: string; panel: string; glow: string; badge: string }> = {
  entry: {
    stripe: "from-[#d7c693] to-[#eadfb8]",
    panel: "border-[#e6dcc2] bg-[#fbf8f1] dark:border-[#645a45] dark:bg-[#211d16]",
    glow: "shadow-[0_18px_36px_-26px_rgba(170,149,95,0.28)]",
    badge: "bg-[#efe7d3] text-[#746348] dark:bg-[#332c1f] dark:text-[#ebdfc4]",
  },
  booked_in: {
    stripe: "from-[#dec79d] to-[#efe1bf]",
    panel: "border-[#e7dbc3] bg-[#fdf8ef] dark:border-[#67583d] dark:bg-[#221c13]",
    glow: "shadow-[0_18px_36px_-26px_rgba(177,144,84,0.3)]",
    badge: "bg-[#f3e7cf] text-[#786242] dark:bg-[#352b1c] dark:text-[#f0e0bf]",
  },
  on_the_bench: {
    stripe: "from-[#dcbcab] to-[#efdbcf]",
    panel: "border-[#e8d4cb] bg-[#fdf6f3] dark:border-[#684a40] dark:bg-[#231916]",
    glow: "shadow-[0_18px_36px_-26px_rgba(168,117,90,0.26)]",
    badge: "bg-[#f1ddd3] text-[#7d5a4d] dark:bg-[#352520] dark:text-[#eed1c4]",
  },
  quoted: {
    stripe: "from-[#d7b9c4] to-[#eed8df]",
    panel: "border-[#e7d0d7] bg-[#fcf6f8] dark:border-[#674956] dark:bg-[#22181d]",
    glow: "shadow-[0_18px_36px_-26px_rgba(160,110,129,0.24)]",
    badge: "bg-[#f0dde3] text-[#775864] dark:bg-[#33242a] dark:text-[#edd4dd]",
  },
  awaiting_parts: {
    stripe: "from-[#b8cbe7] to-[#dce7f6]",
    panel: "border-[#d5e0ee] bg-[#f5f8fc] dark:border-[#4a586e] dark:bg-[#161b22]",
    glow: "shadow-[0_18px_36px_-26px_rgba(110,137,178,0.26)]",
    badge: "bg-[#dde8f4] text-[#54667d] dark:bg-[#24303d] dark:text-[#d8e5f4]",
  },
  repair_completed: {
    stripe: "from-[#b9d7c3] to-[#dbece1]",
    panel: "border-[#d3e5d8] bg-[#f4faf5] dark:border-[#48614f] dark:bg-[#151d17]",
    glow: "shadow-[0_18px_36px_-26px_rgba(102,145,116,0.24)]",
    badge: "bg-[#ddebe1] text-[#58705f] dark:bg-[#243127] dark:text-[#d3e7d8]",
  },
};

function isInternalLvcAccount(item: WorkshopBoardResponseItem): boolean {
  const accountText = `${item.accountName || ""} ${item.job?.accountCode || ""}`.toLowerCase();
  return accountText.includes("lvc");
}

function getCardTheme(item: WorkshopBoardResponseItem) {
  if (isInternalLvcAccount(item)) {
    return {
      shell: "border-[#b8cde4] bg-[#dce9f6] text-[#2f4862] shadow-[0_18px_30px_-22px_rgba(104,136,172,0.32)]",
      tab: "bg-[#c9dcee] text-[#2f4862]",
      meta: "text-[#60758d]",
      chip: "bg-[#edf4fb] text-[#45607b] border-[#c8d8e8]",
      body: "bg-[#edf4fb]",
    };
  }

  return {
    shell: "border-[#e2d59f] bg-[#f6efc7] text-[#554a28] shadow-[0_18px_30px_-22px_rgba(166,145,75,0.28)]",
    tab: "bg-[#efe3ae] text-[#554a28]",
    meta: "text-[#7a6b41]",
    chip: "bg-[#fbf5db] text-[#6b5c31] border-[#e2d4a0]",
    body: "bg-[#fbf6e2]",
  };
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return format(date, "d MMM yyyy");
}

export default function WorkshopBoardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [sendClientUpdate, setSendClientUpdate] = useState(true);
  const [message, setMessage] = useState("");

  const { data: settings, isLoading: settingsLoading } = useQuery<WorkshopSettings>({
    queryKey: ["/api/admin/workshop/settings"],
  });
  const { data: board, isLoading: boardLoading } = useQuery<WorkshopBoardResponseItem[]>({
    queryKey: ["/api/admin/workshop-board"],
  });

  const toggleDemoModeMutation = useMutation({
    mutationFn: async (workshopEmailDemoModeEnabled: boolean) => {
      const response = await apiRequest("PATCH", "/api/admin/workshop/settings", { workshopEmailDemoModeEnabled });
      return response.json() as Promise<WorkshopSettings>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/workshop/settings"] });
      toast({ title: "Workshop settings saved", description: "Demo email routing has been updated." });
    },
    onError: (error) => {
      toast({
        title: "Workshop settings not saved",
        description: error instanceof Error ? error.message : "Unable to update workshop settings",
        variant: "destructive",
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async (input: { jobId: string; lane: WorkshopLane; laneOrder: number; note: string; sendClientUpdate: boolean }) => {
      const response = await apiRequest("POST", `/api/admin/workshop-board/${encodeURIComponent(input.jobId)}/move`, input);
      return response.json() as Promise<{ card: WorkshopBoardResponseItem["card"]; emailResult: { recipient: string; demoMode: boolean } | null; emailError: string | null }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/workshop-board"] });
      if (result.emailResult) {
        toast({
          title: result.emailResult.demoMode ? "Demo update sent" : "Customer update sent",
          description: result.emailResult.demoMode
            ? `Sent to ${result.emailResult.recipient} because demo mode is enabled.`
            : `Sent to ${result.emailResult.recipient}.`,
        });
      } else if (result.emailError) {
        toast({
          title: "Workshop card moved",
          description: `The move was saved, but the email failed: ${result.emailError}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Workshop card updated", description: "The job was moved without sending an email." });
      }
      setPendingMove(null);
      setMessage("");
      setSendClientUpdate(true);
    },
    onError: (error) => {
      toast({
        title: "Workshop card not moved",
        description: error instanceof Error ? error.message : "Unable to update workshop board",
        variant: "destructive",
      });
    },
  });

  const boardByLane = useMemo(() => {
    const grouped = new Map<WorkshopLane, WorkshopBoardResponseItem[]>();
    for (const lane of laneConfig) {
      grouped.set(lane.key, []);
    }

    for (const item of board || []) {
      const lane = item.card.boardLane;
      grouped.get(lane)?.push(item);
    }

    for (const lane of laneConfig) {
      grouped.get(lane.key)?.sort((left, right) => left.card.laneOrder - right.card.laneOrder);
    }

    return grouped;
  }, [board]);

  const demoModeEnabled = settings?.workshopEmailDemoModeEnabled ?? true;
  const demoRecipient = settings?.workshopEmailDemoRecipient ?? "otto@lvcuk.com";
  const isAdminUser = user?.type === "admin";
  const Layout = isAdminUser ? AdminLayout : WorkshopLayout;

  const boardStats = useMemo(() => ({
    total: board?.length || 0,
    partsLane: boardByLane.get("awaiting_parts")?.length || 0,
    ready: boardByLane.get("repair_completed")?.length || 0,
  }), [board, boardByLane]);

  const selectedItem = useMemo(() => {
    if (!selectedJobId) {
      return null;
    }

    return (board || []).find((item) => item.card.jobId === selectedJobId) || null;
  }, [board, selectedJobId]);

  const selectedLane = selectedItem ? laneConfig.find((lane) => lane.key === selectedItem.card.boardLane) || null : null;
  const selectedTheme = selectedItem ? getCardTheme(selectedItem) : null;
  const selectedPartsEta = selectedItem ? formatDate(selectedItem.card.partsEtaOverride || selectedItem.job?.dueDate || null) : null;

  function openMoveDialog(item: WorkshopBoardResponseItem, lane: WorkshopLane) {
    if (item.card.boardLane === lane) {
      return;
    }

    setPendingMove({ item, lane });
    setSendClientUpdate(lane !== "entry");
    setMessage("");
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Workshop Board</h1>
            <p className="text-muted-foreground mt-1">Operational T-card board for active workshop jobs.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="rounded-full border bg-card px-4 py-2 shadow-sm">
              <span className="text-muted-foreground">Active cards</span>
              <span className="ml-2 font-semibold">{boardStats.total}</span>
            </div>
            <div className="rounded-full border bg-card px-4 py-2 shadow-sm">
              <span className="text-muted-foreground">Awaiting parts</span>
              <span className="ml-2 font-semibold">{boardStats.partsLane}</span>
            </div>
            <div className="rounded-full border bg-card px-4 py-2 shadow-sm">
              <span className="text-muted-foreground">Ready to return</span>
              <span className="ml-2 font-semibold">{boardStats.ready}</span>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-border/80 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(241,244,248,0.78)_42%,_rgba(232,236,242,0.95))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(28,34,45,0.98),_rgba(18,23,32,0.96)_42%,_rgba(10,14,21,1))]">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                Workshop Email Demo Mode
              </div>
              <p className="text-sm text-muted-foreground">
                While enabled, all workshop status updates are routed to {demoRecipient} instead of the customer.
              </p>
              <p className="text-xs text-muted-foreground">
                Yellow cards are the default workshop jobs. Blue cards are internal LVC jobs. Click a T-card to open the full detail.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start lg:self-center">
              {settingsLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              {isAdminUser ? (
                <>
                  <Label htmlFor="workshop-demo-mode" className="text-sm font-medium">Demo mode</Label>
                  <Switch
                    id="workshop-demo-mode"
                    checked={demoModeEnabled}
                    disabled={settingsLoading || toggleDemoModeMutation.isPending}
                    onCheckedChange={(checked) => toggleDemoModeMutation.mutate(checked)}
                    data-testid="switch-workshop-demo-mode"
                  />
                </>
              ) : (
                <Badge variant={demoModeEnabled ? "secondary" : "outline"}>
                  {demoModeEnabled ? "Demo Mode Active" : "Live Updates Active"}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-x-auto pb-2 2xl:overflow-visible">
            <div className="grid min-w-max grid-flow-col auto-cols-[minmax(210px,1fr)] gap-3 2xl:min-w-0 2xl:grid-flow-row 2xl:grid-cols-6 2xl:auto-cols-auto">
              {laneConfig.map((lane) => {
                const items = boardByLane.get(lane.key) || [];
                const accent = laneAccentClass[lane.key];
                return (
                  <section
                    key={lane.key}
                    className={cn(
                      "min-h-[360px] rounded-[20px] border p-2.5 backdrop-blur-sm transition-all",
                      accent.panel,
                      accent.glow,
                    )}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedJobId) {
                        return;
                      }
                      const item = (board || []).find((entry) => entry.card.jobId === draggedJobId);
                      if (item) {
                        openMoveDialog(item, lane.key);
                      }
                      setDraggedJobId(null);
                    }}
                    data-testid={`lane-${lane.key}`}
                  >
                    <div className="mb-2.5 rounded-[16px] border border-black/5 bg-white/45 p-2.5 dark:border-white/10 dark:bg-black/15">
                      <div className={cn("mb-2 h-2 rounded-full bg-gradient-to-r", accent.stripe)} />
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-foreground">{lane.label}</h2>
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{lane.description}</p>
                        </div>
                        <Badge className={cn("border-0 font-semibold", accent.badge)}>{items.length}</Badge>
                      </div>
                    </div>

                    <div className="relative space-y-0 pb-3">
                      {boardLoading ? (
                        <Card className="border-dashed">
                          <CardContent className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading cards
                          </CardContent>
                        </Card>
                      ) : items.length === 0 ? (
                        <Card className="border-dashed bg-background/60">
                          <CardContent className="p-4 text-sm text-muted-foreground">No jobs in this lane.</CardContent>
                        </Card>
                      ) : (
                        items.map((item, index) => {
                          const isSelected = selectedJobId === item.card.jobId;
                          const theme = getCardTheme(item);
                          return (
                            <button
                              key={item.card.jobId}
                              type="button"
                              draggable
                              onClick={() => setSelectedJobId((current) => current === item.card.jobId ? null : item.card.jobId)}
                              onDragStart={() => setDraggedJobId(item.card.jobId)}
                              onDragEnd={() => setDraggedJobId(null)}
                              className={cn(
                                "group relative block h-[72px] w-full overflow-hidden rounded-[16px] border text-left transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-primary/50",
                                theme.shell,
                                "-mt-10 cursor-pointer hover:-translate-y-1 hover:shadow-[0_18px_32px_-24px_rgba(0,0,0,0.45)]",
                                index === 0 && "mt-0",
                                isSelected && "translate-y-1 ring-2 ring-white/70 shadow-[0_22px_40px_-24px_rgba(0,0,0,0.45)] dark:ring-white/30",
                              )}
                              style={{ zIndex: isSelected ? 30 : items.length - index }}
                              data-testid={`card-workshop-${item.card.jobId}`}
                            >
                              <div className={cn("border-b px-3 py-2.5", theme.tab)}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[0.7rem] uppercase tracking-[0.2em] opacity-70">Job</div>
                                    <div className="truncate text-[0.95rem] font-semibold leading-tight">{item.card.jobId}</div>
                                    <div className="truncate text-[0.78rem] leading-tight opacity-85">{item.job?.siteName || "Job not in live import"}</div>
                                  </div>
                                  {isAdminUser && item.job ? (
                                    <a
                                      href={`/admin/customer/${encodeURIComponent(item.job.accountCode)}/jobs/${encodeURIComponent(item.job.jobId)}`}
                                      className="mt-0.5 shrink-0 rounded-full bg-black/10 p-1.5 transition hover:bg-black/20"
                                      onClick={(event) => event.stopPropagation()}
                                      data-testid={`link-workshop-live-job-${item.card.jobId}`}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  ) : null}
                                </div>
                              </div>

                              <div className={cn("flex items-center justify-between gap-2 px-3 pb-3 pt-2 text-[11px]", theme.body, theme.meta)}>
                                <div className="truncate">{item.accountName || item.job?.accountCode || "Unknown account"}</div>
                                <div className="flex items-center gap-1 opacity-85">
                                  <Wrench className="h-3.5 w-3.5" />
                                  <span>{isSelected ? "Selected" : "Tap to open"}</span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="2xl:sticky 2xl:top-6 2xl:self-start">
            <Card className="overflow-hidden border-border/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(243,246,250,0.88))] shadow-[0_24px_50px_-30px_rgba(15,23,42,0.4)] dark:bg-[linear-gradient(145deg,rgba(24,29,39,0.98),rgba(14,18,26,0.98))]">
              {selectedItem && selectedTheme ? (
                <>
                  <div className={cn("border-b px-5 py-5", selectedTheme.tab)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[0.72rem] uppercase tracking-[0.22em] opacity-70">Selected T-card</div>
                        <div className="mt-1 text-2xl font-semibold leading-tight">{selectedItem.card.jobId}</div>
                        <div className="truncate text-sm opacity-85">{selectedItem.job?.siteName || "Job not in live import"}</div>
                      </div>
                      <Badge className={cn("border text-xs font-semibold", selectedTheme.chip)}>
                        {selectedLane?.label || "Workshop"}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="space-y-5 p-5">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">{selectedItem.accountName || selectedItem.job?.accountCode || "Unknown account"}</div>
                      <p className="text-sm text-muted-foreground">{selectedItem.job?.shortDescription || selectedItem.card.sourceJobType || "Workshop job"}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className={cn("border text-xs font-medium", selectedTheme.chip)}>{selectedItem.job?.status || selectedItem.card.sourceStatusAtLastSync || "Unknown"}</Badge>
                      {selectedItem.job?.engineerName ? <Badge className={cn("border text-xs font-medium", selectedTheme.chip)}>{selectedItem.job.engineerName}</Badge> : null}
                      {isInternalLvcAccount(selectedItem) ? <Badge className={cn("border text-xs font-medium", selectedTheme.chip)}>Internal LVC</Badge> : null}
                    </div>

                    {selectedPartsEta && selectedItem.card.boardLane === "awaiting_parts" ? (
                      <div className="rounded-xl border border-border/80 bg-muted/50 px-4 py-3 text-sm">
                        <div className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Parts ETA</div>
                        <div className="mt-1 font-semibold">{selectedPartsEta}</div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                      <div className="rounded-xl border border-border/80 bg-muted/35 p-4">
                        <div className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Account Code</div>
                        <div className="mt-1 font-medium">{selectedItem.job?.accountCode || "Unknown"}</div>
                      </div>
                      <div className="rounded-xl border border-border/80 bg-muted/35 p-4">
                        <div className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Equipment</div>
                        <div className="mt-1 font-medium">{selectedItem.job?.equipment || selectedItem.job?.shortDescription || "Not listed"}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-muted/35 p-4">
                      <div className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Status Trace</div>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Board lane</span>
                          <span className="font-medium">{selectedLane?.label || "Unknown"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Portal status</span>
                          <span className="text-right font-medium">{selectedItem.job?.sourcePortalStatus || selectedItem.card.sourceStatusAtLastSync || "Unknown"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Updated</span>
                          <span className="font-medium">{formatDate(selectedItem.card.updatedAt) || "Unknown"}</span>
                        </div>
                      </div>
                    </div>

                    {selectedItem.card.lastEmailOutcome ? (
                      <div className="rounded-xl border border-border/80 bg-muted/35 p-4 text-sm">
                        <div className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Last Update</div>
                        <div className="mt-2">{selectedItem.card.lastEmailOutcome}</div>
                      </div>
                    ) : null}

                    <div className="grid gap-2">
                      {laneConfig.filter((targetLane) => targetLane.key !== selectedItem.card.boardLane).map((targetLane) => (
                        <Button
                          key={targetLane.key}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-between rounded-xl px-3"
                          onClick={() => openMoveDialog(selectedItem, targetLane.key)}
                          data-testid={`panel-move-${selectedItem.card.jobId}-${targetLane.key}`}
                        >
                          <span>Move to {targetLane.label}</span>
                          <MoveRight className="h-4 w-4" />
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </>
              ) : (
                <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="rounded-full border border-border/80 bg-muted/40 p-4">
                    <Wrench className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle>Select a T-card</CardTitle>
                    <CardDescription className="mt-2">
                      Keep the workshop lanes compact on the left, then use this side panel for the full job detail and move actions.
                    </CardDescription>
                  </div>
                </CardContent>
              )}
            </Card>
          </aside>
        </div>

        <Dialog open={!!pendingMove} onOpenChange={(open) => !open && !moveMutation.isPending && setPendingMove(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move workshop job</DialogTitle>
              <DialogDescription>
                {pendingMove
                  ? `Move ${pendingMove.item.card.jobId} to ${laneConfig.find((lane) => lane.key === pendingMove.lane)?.label}?`
                  : "Confirm workshop movement."}
              </DialogDescription>
            </DialogHeader>

            {pendingMove ? (
              <div className="space-y-4">
                <div className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{pendingMove.item.job?.siteName}</div>
                  <div className="text-muted-foreground">{pendingMove.item.job?.shortDescription || pendingMove.item.card.sourceJobType}</div>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-md border p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Send client update
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {demoModeEnabled
                        ? `Demo mode is enabled, so this will send only to ${demoRecipient}.`
                        : "This will send to the customer email stored on the account."}
                    </p>
                  </div>
                  <Switch checked={sendClientUpdate} onCheckedChange={setSendClientUpdate} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workshop-move-note">Message note</Label>
                  <Textarea
                    id="workshop-move-note"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Optional note to include in the update email."
                    rows={5}
                    data-testid="textarea-workshop-move-note"
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPendingMove(null)} disabled={moveMutation.isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!pendingMove || moveMutation.isPending}
                onClick={() => {
                  if (!pendingMove) {
                    return;
                  }
                  const laneItems = boardByLane.get(pendingMove.lane) || [];
                  moveMutation.mutate({
                    jobId: pendingMove.item.card.jobId,
                    lane: pendingMove.lane,
                    laneOrder: laneItems.length,
                    note: message,
                    sendClientUpdate,
                  });
                }}
                data-testid="button-confirm-workshop-move"
              >
                {moveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm move"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!boardLoading && (board?.length || 0) === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <PackageSearch className="h-10 w-10" />
              <div>
                <p className="font-medium text-foreground">No active workshop jobs found</p>
                <p className="text-sm">Import live jobs with workshop job types to populate the board.</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Layout>
  );
}
