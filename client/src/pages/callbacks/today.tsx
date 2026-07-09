import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { AlertTriangle, CalendarClock, CheckCircle2, PhoneCall } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CallbacksLayout } from "./layout";

type CallbackJob = {
  jobId: string;
  clientName: string | null;
  siteName: string;
  status: string;
  engineerName: string | null;
  dueDate: string | null;
  visitDate: string | null;
  workflowStatus: string;
  teamTakeoverEligible: boolean;
};

type TodayResponse = {
  summary: {
    total: number;
    etaExpired: number;
    etaDueSoon: number;
    visitDateLapsed: number;
    teamTakeoverRequired: number;
  };
  priorityJobs: CallbackJob[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy");
}

function workflowLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default function CallbacksTodayPage() {
  const { data, isLoading } = useQuery<TodayResponse>({
    queryKey: ["/api/callbacks/today"],
    queryFn: async () => {
      const res = await fetch("/api/callbacks/today", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load callbacks today view");
      return res.json();
    },
  });

  return (
    <CallbacksLayout>
      <div className="space-y-6 max-w-7xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Callbacks Today</h1>
            <p className="text-muted-foreground mt-1">Callbacks needing planning, chasing, or team takeover.</p>
          </div>
          <Link href="/callbacks/jobs">
            <Button variant="outline">Open master list</Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {isLoading ? [...Array(5)].map((_, index) => <Skeleton key={index} className="h-24" />) : (
            <>
              <Card><CardContent className="p-4"><div className="text-2xl font-bold">{data?.summary.total ?? 0}</div><div className="text-xs text-muted-foreground">Total callbacks</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-2xl font-bold text-red-600">{data?.summary.etaExpired ?? 0}</div><div className="text-xs text-muted-foreground">ETA expired</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-2xl font-bold text-yellow-600">{data?.summary.etaDueSoon ?? 0}</div><div className="text-xs text-muted-foreground">ETA due soon</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-2xl font-bold text-orange-600">{data?.summary.visitDateLapsed ?? 0}</div><div className="text-xs text-muted-foreground">Visit date lapsed</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-2xl font-bold text-primary">{data?.summary.teamTakeoverRequired ?? 0}</div><div className="text-xs text-muted-foreground">Team takeover</div></CardContent></Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Priority Callback Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[...Array(6)].map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
            ) : !data?.priorityJobs.length ? (
              <div className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
                No callback jobs are currently visible from imported job data.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Job</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Site</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Engineer</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">ETA</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Visit</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">State</th>
                      <th className="pb-3 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.priorityJobs.map((job) => (
                      <tr key={job.jobId} className="border-b last:border-0">
                        <td className="py-4 font-medium">{job.jobId}<div className="text-xs text-muted-foreground">{job.clientName}</div></td>
                        <td className="py-4">{job.siteName}</td>
                        <td className="py-4">{job.engineerName || "-"}</td>
                        <td className="py-4">{formatDate(job.dueDate)}</td>
                        <td className="py-4">{formatDate(job.visitDate)}</td>
                        <td className="py-4">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit capitalize">{workflowLabel(job.workflowStatus)}</Badge>
                            {job.teamTakeoverEligible ? <span className="inline-flex items-center gap-1 text-xs text-orange-600"><AlertTriangle className="h-3 w-3" /> Team takeover</span> : null}
                          </div>
                        </td>
                        <td className="py-4 text-right">
                          <Link href={`/callbacks/jobs/${encodeURIComponent(job.jobId)}`}>
                            <Button variant="ghost" size="sm"><PhoneCall className="h-4 w-4" /></Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-medium">V1 Operating Rule</CardTitle></CardHeader>
          <CardContent className="flex gap-3 text-sm text-muted-foreground">
            <CalendarClock className="h-4 w-4 mt-0.5" />
            A callback becomes eligible for team takeover when its engineer visit date is in the past.
          </CardContent>
        </Card>
      </div>
    </CallbacksLayout>
  );
}