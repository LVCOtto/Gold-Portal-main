import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { Eye, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type JobsResponse = { jobs: CallbackJob[]; total: number };

function formatDate(value: string | null) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy");
}

export default function CallbacksJobsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/callbacks/jobs", search],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/callbacks/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load callback jobs");
      return res.json();
    },
  });

  return (
    <CallbacksLayout>
      <div className="space-y-6 max-w-7xl">
        <div>
          <h1 className="text-2xl font-semibold">Callback Master List</h1>
          <p className="text-muted-foreground mt-1">All imported jobs where the job type contains callback.</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search callbacks..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[...Array(8)].map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
            ) : !data?.jobs.length ? (
              <div className="py-12 text-center text-muted-foreground">No callback jobs found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Job</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Site</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Engineer</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">ETA</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Visit</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Workflow</th>
                      <th className="pb-3 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((job) => (
                      <tr key={job.jobId} className="border-b last:border-0">
                        <td className="py-4 font-medium">{job.jobId}<div className="text-xs text-muted-foreground">{job.clientName}</div></td>
                        <td className="py-4">{job.siteName}</td>
                        <td className="py-4">{job.status}</td>
                        <td className="py-4">{job.engineerName || "-"}</td>
                        <td className="py-4">{formatDate(job.dueDate)}</td>
                        <td className="py-4">{formatDate(job.visitDate)}</td>
                        <td className="py-4"><Badge variant="outline" className="capitalize">{job.workflowStatus.replace(/_/g, " ")}</Badge></td>
                        <td className="py-4 text-right">
                          <Link href={`/callbacks/jobs/${encodeURIComponent(job.jobId)}`}>
                            <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
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
      </div>
    </CallbacksLayout>
  );
}