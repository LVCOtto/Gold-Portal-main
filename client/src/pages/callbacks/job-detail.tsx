import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { Mail, PhoneCall, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type JobDetail = { job: CallbackJob; purchaseOrders: Array<{ poId: string; supplierName: string | null; poStatus: string; etaDate: string | null }> };

function formatDate(value: string | null) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy");
}

export default function CallbacksJobDetailPage() {
  const [, params] = useRoute("/callbacks/jobs/:jobId");
  const jobId = params?.jobId || "";
  const { data, isLoading } = useQuery<JobDetail>({
    queryKey: ["/api/callbacks/jobs", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/callbacks/jobs/${encodeURIComponent(jobId)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load callback job");
      return res.json();
    },
    enabled: !!jobId,
  });

  return (
    <CallbacksLayout>
      <div className="space-y-6 max-w-5xl">
        {isLoading ? <Skeleton className="h-32" /> : data ? (
          <>
            <div>
              <h1 className="text-2xl font-semibold">{data.job.jobId}</h1>
              <p className="text-muted-foreground mt-1">{data.job.clientName} - {data.job.siteName}</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base font-medium">Callback Details</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div><div className="font-medium">{data.job.status}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Workflow</div><div className="font-medium capitalize">{data.job.workflowStatus.replace(/_/g, " ")}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Engineer</div><div className="font-medium">{data.job.engineerName || "-"}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Team takeover</div><div className="font-medium">{data.job.teamTakeoverEligible ? "Eligible" : "Not yet"}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Parts ETA</div><div className="font-medium">{formatDate(data.job.dueDate)}</div></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Visit date</div><div className="font-medium">{formatDate(data.job.visitDate)}</div></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Quick Actions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Button className="w-full justify-start gap-2" variant="outline"><Mail className="h-4 w-4" /> Send customer update</Button>
                  <Button className="w-full justify-start gap-2" variant="outline"><PhoneCall className="h-4 w-4" /> Chase engineer</Button>
                  <Button className="w-full justify-start gap-2" variant="outline"><Warehouse className="h-4 w-4" /> Chase warehouse</Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base font-medium">Purchase Orders</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {data.purchaseOrders.length === 0 ? <p className="text-muted-foreground">No linked purchase orders found.</p> : data.purchaseOrders.map((po) => (
                  <div key={po.poId} className="rounded-md border p-3">
                    <div className="font-medium">{po.poId}</div>
                    <div className="text-muted-foreground">{po.supplierName || "Unknown supplier"} - {po.poStatus} - ETA {formatDate(po.etaDate)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Callback job not found.</CardContent></Card>
        )}
      </div>
    </CallbacksLayout>
  );
}