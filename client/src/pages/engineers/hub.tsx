import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mail, PhoneCall, CalendarClock, Search, AlertTriangle, ClipboardList, Wrench, BriefcaseBusiness, CalendarDays, PackageOpen, CheckCircle2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEngineerAuth } from "@/lib/engineer-auth";
import { EngineersLayout } from "./layout";

type EngineerCategory = "available" | "planned" | "attention" | "awaiting_parts" | "completed" | "all";

type PurchaseOrderSummary = {
  poId: string;
  poStatus: string;
  etaDate: string | null;
};

type EngineerJob = {
  jobId: string;
  accountCode: string;
  accountName: string | null;
  accountEmail: string | null;
  siteName: string;
  status: string;
  sourcePortalStatus: string | null;
  jobType: string | null;
  priority: string | null;
  shortDescription: string;
  engineerName: string | null;
  dueDate: string | null;
  visitDate: string | null;
  nextActionDueDate: string | null;
  lastVisitDate: string | null;
  lastUpdatedDate: string;
  equipment: string | null;
  purchaseOrders: PurchaseOrderSummary[];
};

type EngineerJobsResponse = {
  jobs: EngineerJob[];
  total: number;
  page: number;
  pageSize: number;
  category: EngineerCategory;
  summary: {
    total: number;
    available: number;
    planned: number;
    attention: number;
    awaitingParts: number;
    completed: number;
  };
  support: {
    email: string;
    phone: string;
  };
  selectedEngineer?: string | null;
};

type EngineerOptionsResponse = {
  engineers: string[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy");
}

function categoryLabel(category: EngineerCategory): string {
  const labels: Record<EngineerCategory, string> = {
    available: "Available Jobs",
    planned: "Planned Work",
    attention: "Attention Needed",
    awaiting_parts: "Awaiting Parts",
    completed: "Completed",
    all: "All Jobs",
  };
  return labels[category];
}

function statusTone(category: EngineerCategory): "default" | "destructive" | "secondary" | "outline" {
  if (category === "attention") return "destructive";
  if (category === "awaiting_parts") return "secondary";
  if (category === "available") return "default";
  return "outline";
}

export default function EngineersHubPage() {
  const { operator } = useEngineerAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EngineerCategory>("available");
  const [selectedEngineer, setSelectedEngineer] = useState("");
  const canSelectEngineer = !!operator?.canSelectEngineer;

  const optionsQuery = useQuery<EngineerOptionsResponse>({
    queryKey: ["/api/engineers/engineers"],
    queryFn: async () => {
      const res = await fetch("/api/engineers/engineers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load engineer list");
      return res.json();
    },
    enabled: canSelectEngineer,
  });

  const query = useQuery<EngineerJobsResponse>({
    queryKey: ["/api/engineers/jobs", search, category, selectedEngineer],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "100", category });
      if (search.trim()) params.set("search", search.trim());
      if (canSelectEngineer && selectedEngineer) params.set("engineer", selectedEngineer);
      const res = await fetch(`/api/engineers/jobs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load engineer jobs");
      return res.json();
    },
    enabled: !canSelectEngineer || !!selectedEngineer,
  });

  const jobs = query.data?.jobs || [];
  const summary = query.data?.summary;

  const chips = useMemo(
    () => [
      { key: "available" as EngineerCategory, label: "Available Jobs", value: summary?.available || 0, icon: BriefcaseBusiness },
      { key: "planned" as EngineerCategory, label: "Planned Work", value: summary?.planned || 0, icon: CalendarDays },
      { key: "attention" as EngineerCategory, label: "Attention Needed", value: summary?.attention || 0, icon: AlertTriangle },
      { key: "awaiting_parts" as EngineerCategory, label: "Awaiting Parts", value: summary?.awaitingParts || 0, icon: PackageOpen },
      { key: "completed" as EngineerCategory, label: "Completed", value: summary?.completed || 0, icon: CheckCircle2 },
      { key: "all" as EngineerCategory, label: "All Jobs", value: summary?.total || 0, icon: ClipboardList },
    ],
    [summary],
  );

  return (
    <EngineersLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">{canSelectEngineer ? "Engineer Hub Preview" : "My Job Management Hub"}</h1>
            <p className="text-sm text-muted-foreground mt-1">Plan work, manage comms, and keep every assigned job moving.</p>
          </div>
          <div className="w-full max-w-xl">
            <form
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchInput);
              }}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by job, site, account, type, or status"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </form>
          </div>
        </div>

        {canSelectEngineer ? (
          <Card>
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
              <CardTitle className="text-base font-medium">Select engineer view</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-3">
              <Select
                value={selectedEngineer}
                onValueChange={(engineer) => {
                  setSelectedEngineer(engineer);
                  setCategory("available");
                  setSearchInput("");
                  setSearch("");
                }}
              >
                <SelectTrigger className="w-full sm:max-w-md" data-testid="select-engineer-preview">
                  <SelectValue placeholder={optionsQuery.isLoading ? "Loading engineers..." : "Choose an engineer"} />
                </SelectTrigger>
                <SelectContent>
                  {(optionsQuery.data?.engineers || []).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedEngineer ? (
                <p className="text-sm text-muted-foreground">Pick an engineer to load their hub view.</p>
              ) : (
                <p className="text-sm text-muted-foreground">Showing hub as <span className="font-medium text-foreground">{selectedEngineer}</span>.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`w-36 sm:w-auto sm:min-w-36 shrink-0 snap-start rounded-md border p-3 text-left transition-colors ${chip.key === category ? "bg-primary/10 border-primary/40 shadow-sm" : "bg-card hover:bg-muted"}`}
              onClick={() => setCategory(chip.key)}
            >
              <div className="flex items-center justify-between gap-2">
                <chip.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xl font-semibold">{chip.value}</span>
              </div>
              <p className="text-xs font-medium mt-2 whitespace-nowrap">{chip.label}</p>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {categoryLabel(category)} jobs
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            {canSelectEngineer && !selectedEngineer ? (
              <div className="py-12 text-center text-muted-foreground">Select an engineer above to load their jobs.</div>
            ) : query.isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, index) => (
                  <Skeleton key={index} className="h-16" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">No jobs match this view.</div>
            ) : (
              <Accordion type="multiple" className="w-full">
                {jobs.map((job) => (
                  <AccordionItem key={job.jobId} value={job.jobId}>
                    <AccordionTrigger className="py-3 sm:py-4 hover:no-underline items-start gap-2 text-left">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap pr-1">
                          <span className="font-semibold">{job.jobId}</span>
                          <Badge variant={statusTone(category)}>{job.status}</Badge>
                          {job.priority ? <Badge variant="outline">{job.priority}</Badge> : null}
                        </div>
                        <p className="text-sm font-medium mt-1.5 break-words">{job.siteName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{job.accountName || job.accountCode}</span>
                          {job.visitDate ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(job.visitDate)}</span> : null}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-3">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs uppercase text-muted-foreground tracking-wide">Visit Date</p>
                              <p className="font-medium">{formatDate(job.visitDate)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-muted-foreground tracking-wide">Parts Due</p>
                              <p className="font-medium">{formatDate(job.dueDate)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-muted-foreground tracking-wide">Next Action Due</p>
                              <p className="font-medium">{formatDate(job.nextActionDueDate)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase text-muted-foreground tracking-wide">Last Updated</p>
                              <p className="font-medium">{formatDate(job.lastUpdatedDate)}</p>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Job Details</p>
                            {job.jobType ? <Badge variant="secondary" className="mb-2 whitespace-normal text-left">{job.jobType}</Badge> : null}
                            <p className="text-sm">{job.shortDescription || "No summary available"}</p>
                            {job.equipment ? (
                              <p className="text-xs text-muted-foreground mt-2">Equipment: {job.equipment}</p>
                            ) : null}
                          </div>

                          {job.purchaseOrders.length > 0 ? (
                            <div className="rounded-md border p-3 space-y-2">
                              <p className="text-xs uppercase text-muted-foreground tracking-wide">Linked Purchase Orders</p>
                              {job.purchaseOrders.map((po) => (
                                <div key={po.poId} className="text-sm flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                                  <span className="font-medium">{po.poId}</span>
                                  <span className="text-muted-foreground">{po.poStatus} · ETA {formatDate(po.etaDate)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs uppercase text-muted-foreground tracking-wide">Contact Actions</p>

                          <Button asChild variant="outline" className="w-full justify-start gap-2">
                            <a href={`mailto:${query.data?.support.email}?subject=${encodeURIComponent(`Job ${job.jobId} planning update`)}`}>
                              <Mail className="h-4 w-4" />
                              Email service support
                            </a>
                          </Button>

                          <Button asChild variant="outline" className="w-full justify-start gap-2">
                            <a href={`tel:${(query.data?.support.phone || "").replace(/\s+/g, "")}`}>
                              <PhoneCall className="h-4 w-4" />
                              Call support
                            </a>
                          </Button>

                          {job.accountEmail ? (
                            <Button asChild variant="outline" className="w-full justify-start gap-2">
                              <a
                                href={`mailto:${job.accountEmail}?subject=${encodeURIComponent(`Job ${job.jobId} update`)}&body=${encodeURIComponent(
                                  `Hi,\n\nQuick update for job ${job.jobId} at ${job.siteName}.\n\nStatus: ${job.status}.\nVisit date: ${formatDate(job.visitDate)}.\n\nThanks,`,
                                )}`}
                              >
                                <Mail className="h-4 w-4" />
                                Email customer contact
                              </a>
                            </Button>
                          ) : (
                            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                              No customer email on file for this account.
                            </div>
                          )}

                          <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
                            <p className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Keep planned dates current after each update.</p>
                            <p className="flex items-center gap-1"><Wrench className="h-3.5 w-3.5" /> Flag parts-risk jobs early so planning can rebook quickly.</p>
                            {job.visitDate ? null : (
                              <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> No visit date set yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </EngineersLayout>
  );
}
