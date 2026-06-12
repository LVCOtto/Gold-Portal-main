import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, Loader2, Mail, MoveRight, PackageSearch, ShieldAlert } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  const { toast } = useToast();
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
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

  function openMoveDialog(item: WorkshopBoardResponseItem, lane: WorkshopLane) {
    if (item.card.boardLane === lane) {
      return;
    }

    setPendingMove({ item, lane });
    setSendClientUpdate(lane !== "entry");
    setMessage("");
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Workshop Board</h1>
            <p className="text-muted-foreground mt-1">Operational T-card board for active workshop jobs.</p>
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                Workshop Email Demo Mode
              </div>
              <p className="text-sm text-muted-foreground">
                While enabled, all workshop status updates are routed to {demoRecipient} instead of the customer.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start lg:self-center">
              {settingsLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              <Label htmlFor="workshop-demo-mode" className="text-sm font-medium">Demo mode</Label>
              <Switch
                id="workshop-demo-mode"
                checked={demoModeEnabled}
                disabled={settingsLoading || toggleDemoModeMutation.isPending}
                onCheckedChange={(checked) => toggleDemoModeMutation.mutate(checked)}
                data-testid="switch-workshop-demo-mode"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
          {laneConfig.map((lane) => {
            const items = boardByLane.get(lane.key) || [];
            return (
              <section
                key={lane.key}
                className="min-h-[220px] rounded-xl border border-border/70 bg-card/40 p-3"
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
                <div className="mb-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{lane.label}</h2>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{lane.description}</p>
                </div>

                <div className="space-y-3">
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
                    items.map((item) => {
                      const partsEta = formatDate(item.card.partsEtaOverride || item.job?.dueDate || null);
                      return (
                        <Card
                          key={item.card.jobId}
                          draggable
                          onDragStart={() => setDraggedJobId(item.card.jobId)}
                          onDragEnd={() => setDraggedJobId(null)}
                          className="cursor-grab border-border/70 bg-background/95 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          data-testid={`card-workshop-${item.card.jobId}`}
                        >
                          <CardHeader className="space-y-3 pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <CardTitle className="text-base">{item.card.jobId}</CardTitle>
                                <CardDescription>{item.job?.accountCode || "Unknown account"}</CardDescription>
                              </div>
                              {item.job ? (
                                <a
                                  href={`/admin/customer/${encodeURIComponent(item.job.accountCode)}/jobs/${encodeURIComponent(item.job.jobId)}`}
                                  className="text-muted-foreground transition hover:text-foreground"
                                  data-testid={`link-workshop-live-job-${item.card.jobId}`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : null}
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="font-medium leading-snug">{item.job?.siteName || "Job no longer present in live data"}</p>
                              <p className="text-muted-foreground">{item.job?.shortDescription || item.card.sourceJobType || "Workshop job"}</p>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-0 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{item.job?.status || item.card.sourceStatusAtLastSync || "Unknown"}</Badge>
                              {item.job?.engineerName ? <Badge variant="secondary">{item.job.engineerName}</Badge> : null}
                            </div>
                            {partsEta && item.card.boardLane === "awaiting_parts" ? (
                              <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                ETA: {partsEta}
                              </div>
                            ) : null}
                            {item.card.lastEmailOutcome ? (
                              <div className="text-xs text-muted-foreground">
                                Last update: {item.card.lastEmailOutcome}
                              </div>
                            ) : null}
                            <div className="grid gap-2">
                              {laneConfig.filter((targetLane) => targetLane.key !== item.card.boardLane).slice(0, 3).map((targetLane) => (
                                <Button
                                  key={targetLane.key}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="justify-between px-3"
                                  onClick={() => openMoveDialog(item, targetLane.key)}
                                  data-testid={`button-move-${item.card.jobId}-${targetLane.key}`}
                                >
                                  <span>Move to {targetLane.label}</span>
                                  <MoveRight className="h-4 w-4" />
                                </Button>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
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
    </AdminLayout>
  );
}
