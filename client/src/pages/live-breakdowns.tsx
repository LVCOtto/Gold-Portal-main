import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ArrowLeft, Check, Copy, RefreshCw, Radio, Clock3, Wrench } from "lucide-react";
import lvcLogo from "@assets/logo.png";
import type { Job } from "@shared/schema";

type LiveBreakdownJob = Job;

interface LiveBreakdownResponse {
  jobs: LiveBreakdownJob[];
  total: number;
  generatedAt: string;
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "d MMM yyyy, HH:mm");
}

function getStatusSummary(jobs: LiveBreakdownJob[]) {
  const pendingEngineerVisit = jobs.filter((job) => job.status?.toLowerCase().includes("pending engineer visit")).length;
  const processing = jobs.filter((job) => job.status?.toLowerCase().includes("processing")).length;
  return { pendingEngineerVisit, processing };
}

export default function LiveBreakdownsPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useQuery<LiveBreakdownResponse>({
    queryKey: ["/api/public/live-breakdowns"],
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const summary = useMemo(() => getStatusSummary(data?.jobs || []), [data?.jobs]);

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({
        title: "Link copied",
        description: "The public breakdown board URL is now on your clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser would not allow clipboard access.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(24,99,220,0.14),_transparent_36%),linear-gradient(180deg,_rgba(248,250,252,0.9),_rgba(241,245,249,0.98))]">
      <header className="border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="shrink-0">
                <img src={lvcLogo} alt="LVC UK" className="h-9" />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">Live Breakdown Board</h1>
                  <Badge variant="secondary" className="gap-1.5">
                    <Radio className="h-3.5 w-3.5" />
                    Public view
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Read-only live feed of jobs with a breakdown job type and a status of Pending Engineer Visit or Processing.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={copyPublicLink} data-testid="button-copy-public-link">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-breakdowns">
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Total breakdown jobs</CardDescription>
              <CardTitle className="text-3xl">{data?.total ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-slate-200/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Pending engineer visit</CardDescription>
              <CardTitle className="text-3xl">{summary.pendingEngineerVisit}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-slate-200/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Processing</CardDescription>
              <CardTitle className="text-3xl">{summary.processing}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="shadow-lg border-slate-200/70">
          <CardHeader className="border-b bg-slate-50/70">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Live jobs</CardTitle>
                <CardDescription>
                  Automatically refreshes every 15 seconds. Last update: {data ? formatDateTime(data.generatedAt) : "—"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                <span>Live read-only board</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-10 text-center text-muted-foreground">
                <Wrench className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p className="text-lg font-medium text-foreground">Unable to load live breakdown jobs</p>
                <p className="mt-1 text-sm">Please try refreshing the page.</p>
                <Button variant="outline" className="mt-4" onClick={() => refetch()}>
                  Try again
                </Button>
              </div>
            ) : (data?.jobs.length || 0) === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <Radio className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p className="text-lg font-medium text-foreground">No live breakdown jobs right now</p>
                <p className="mt-1 text-sm">Jobs will appear here when they have a Breakdown job type and a matching live status.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-6 py-4 text-left font-medium">Job</th>
                      <th className="px-6 py-4 text-left font-medium">Account</th>
                      <th className="px-6 py-4 text-left font-medium">Site</th>
                      <th className="px-6 py-4 text-left font-medium">Job Type</th>
                      <th className="px-6 py-4 text-left font-medium">Status</th>
                      <th className="px-6 py-4 text-left font-medium">Engineer</th>
                      <th className="px-6 py-4 text-left font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data?.jobs.map((job) => (
                      <tr key={job.id} className="hover:bg-slate-50/70 transition-colors" data-testid={`row-breakdown-${job.jobId}`}>
                        <td className="px-6 py-4 font-medium whitespace-nowrap">{job.jobId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">{job.accountCode}</td>
                        <td className="px-6 py-4 min-w-[18rem]">
                          <div className="font-medium text-foreground">{job.siteName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">{job.shortDescription}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">{job.jobType || "—"}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">{job.engineerName || "—"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">{formatDateTime(job.lastUpdatedDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
