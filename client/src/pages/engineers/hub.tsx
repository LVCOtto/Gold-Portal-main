import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mail, PhoneCall, CalendarClock, Search, AlertTriangle, ClipboardList, Wrench } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EngineersLayout } from "./layout";

type EngineerCategory = "all" | "today" | "upcoming" | "overdue" | "awaiting_parts" | "unplanned" | "completed";

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
    today: number;
    upcoming: number;
    overdue: number;
    awaitingParts: number;
    unplanned: number;
    completed: number;
  };
  support: {
    email: string;
    phone: string;
  };
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy");
}

function categoryLabel(category: EngineerCategory): string {
  const labels: Record<EngineerCategory, string> = {
    all: "All",
    today: "Today",
    upcoming: "Upcoming (7 days)",
    overdue: "Overdue",
    awaiting_parts: "Awaiting parts",
    unplanned: "Unplanned",
    completed: "Completed",
  };
  return labels[category];
}

function statusTone(category: EngineerCategory): "default" | "destructive" | "secondary" | "outline" {
  if (category === "overdue") return "destructive";
  if (category === "awaiting_parts") return "secondary";
  if (category === "today") return "default";
  return "outline";
}

export default function EngineersHubPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EngineerCategory>("all");

  const query = useQuery<EngineerJobsResponse>({
    queryKey: ["/api/engineers/jobs", search, category],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "100", category });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/engineers/jobs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load engineer jobs");
      return res.json();
    },
  });

  const jobs = query.data?.jobs || [];
  const summary = query.data?.summary;

  const chips = useMemo(
    () => [
      { key: "all" as EngineerCategory, label: "All", value: summary?.total || 0 },
      { key: "today" as EngineerCategory, label: "Today", value: summary?.today || 0 },
      { key: "upcoming" as EngineerCategory, label: "Upcoming", value: summary?.upcoming || 0 },
      { key: "overdue" as EngineerCategory, label: "Overdue", value: summary?.overdue || 0 },
      { key: "awaiting_parts" as EngineerCategory, label: "Awaiting parts", value: summary?.awaitingParts || 0 },
      { key: "unplanned" as EngineerCategory, label: "Unplanned", value: summary?.unplanned || 0 },
      { key: "completed" as EngineerCategory, label: "Completed", value: summary?.completed || 0 },
    ],
    [summary],
  );

  return (
    <EngineersLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">My Job Management Hub</h1>
            <p className="text-muted-foreground mt-1">Plan work, manage comms, and keep every assigned job moving.</p>
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

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`rounded-md border p-3 text-left transition-colors ${chip.key === category ? "bg-primary/10 border-primary/30" : "hover:bg-muted"}`}
              onClick={() => setCategory(chip.key)}
            >
              <p className="text-xs text-muted-foreground">{chip.label}</p>
              <p className="text-xl font-semibold mt-1">{chip.value}</p>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              {categoryLabel(category)} jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
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
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{job.jobId}</span>
                          <Badge variant={statusTone(category)}>{job.status}</Badge>
                          {job.priority ? <Badge variant="outline">{job.priority}</Badge> : null}
                          {job.jobType ? <Badge variant="secondary">{job.jobType}</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-1">{job.accountName || job.accountCode} · {job.siteName}</p>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2 text-sm">
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
                            <p className="text-sm">{job.shortDescription || "No summary available"}</p>
                            {job.equipment ? (
                              <p className="text-xs text-muted-foreground mt-2">Equipment: {job.equipment}</p>
                            ) : null}
                          </div>

                          {job.purchaseOrders.length > 0 ? (
                            <div className="rounded-md border p-3 space-y-2">
                              <p className="text-xs uppercase text-muted-foreground tracking-wide">Linked Purchase Orders</p>
                              {job.purchaseOrders.map((po) => (
                                <div key={po.poId} className="text-sm flex items-center justify-between gap-2">
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
