import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Calendar, User, MapPin, Package, Info, MessageCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CustomerLayout } from "@/components/customer-layout";
import { JobOverrideDialog } from "@/components/admin/job-override-dialog";
import { JobStatusFlow } from "@/components/job-status-flow";
import { StatusBadge } from "@/components/status-badge";
import { useCustomerPortal } from "@/lib/customer-portal";
import { format, addDays, isWeekend } from "date-fns";
import type { Job, PurchaseOrder } from "@shared/schema";

function addWorkingDays(date: Date, days: number): Date {
  let result = new Date(date);
  let added = 0;
  while (added < days) {
    result = addDays(result, 1);
    if (!isWeekend(result)) {
      added++;
    }
  }
  return result;
}

function formatPartsWindow(dateStr: string): string {
  const startDate = new Date(dateStr);
  const endDate = addWorkingDays(startDate, 3);
  return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
}

const SUPPORT_EMAIL = "service@lvcuk.com";

function createJobMailtoLink(action: 'chase' | 'query', job: Job): string {
  const subject = action === 'chase' 
    ? `Job Chase: ${job.jobId}`
    : `Job Query: ${job.jobId}`;
  
  const body = action === 'chase'
    ? `Hi LVC Team,

I would like to follow up on the status of my job:

Job ID: ${job.jobId}
Site: ${job.siteName}
Status: ${job.status}
Description: ${job.shortDescription}

Could you please provide an update on the progress of this job?

Best regards`
    : `Hi LVC Team,

I have a query about the following job:

Job ID: ${job.jobId}
Site: ${job.siteName}
Status: ${job.status}
Description: ${job.shortDescription}

My question:
[Please describe your query here]

Best regards`;

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

interface JobWithOverride extends Job {
  displayStatus: string | null;
  adminNotes: string | null;
  upcomingDate: string | null;
  upcomingDateType: 'parts' | 'visit' | null;
  equipment: string | null;
}

interface JobDetailResponse {
  job: JobWithOverride;
  purchaseOrders: PurchaseOrder[];
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function POCard({ po }: { po: PurchaseOrder }) {
  return (
    <div 
      className="p-4 rounded-md border"
      data-testid={`card-po-${po.poId}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-medium">{po.poId}</span>
        <StatusBadge status={po.poStatus} />
      </div>
      {po.supplierName && (
        <div className="text-sm text-muted-foreground">{po.supplierName}</div>
      )}
      {po.outstandingLinesCount !== null && po.outstandingLinesCount > 0 && (
        <div className="mt-2 text-sm">
          <Badge variant="outline">{po.outstandingLinesCount} outstanding lines</Badge>
        </div>
      )}
      {po.etaDate && (
        <div className="mt-2 text-xs text-muted-foreground">
          ETA: {format(new Date(po.etaDate), "MMM d, yyyy")}
        </div>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  const portal = useCustomerPortal();
  const { jobId } = useParams<{ jobId: string }>();

  const { data, isLoading, error } = useQuery<JobDetailResponse>({
    queryKey: [portal.api.jobDetail(jobId), portal.accountParams],
  });

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-36 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (error || !data?.job) {
    return (
      <CustomerLayout>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold mb-2">Job Not Found</h2>
          <p className="text-muted-foreground mb-4">The job you're looking for doesn't exist or you don't have access.</p>
          <Link href={portal.routes.jobs}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Jobs
            </Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const { job, purchaseOrders } = data;
  const displayStatus = job.displayStatus || job.status;

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={portal.routes.jobs}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold" data-testid="text-job-id">{job.jobId}</h1>
              <StatusBadge status={displayStatus} />
              {portal.isAdminMode && <JobOverrideDialog job={job} />}
            </div>
            <p className="text-muted-foreground text-sm mt-1">{job.siteName}</p>
          </div>
        </div>

        <JobStatusFlow
          status={displayStatus}
          workflowStatus={job.status}
          jobDescription={job.shortDescription}
          upcomingDate={job.upcomingDate}
          upcomingDateType={job.upcomingDateType}
          lastUpdatedDate={job.lastUpdatedDate}
        />

        {job.adminNotes && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription data-testid="text-admin-notes">
              <span className="font-medium">Update from LVC:</span> {job.adminNotes}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Job Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <InfoRow icon={MapPin} label="Site" value={job.siteName} />
                  <InfoRow icon={User} label="Engineer" value={job.engineerName} />
                  {job.lastVisitDate && (
                    <InfoRow 
                      icon={Calendar} 
                      label="Last Visit" 
                      value={format(new Date(job.lastVisitDate), "MMM d, yyyy")} 
                    />
                  )}
                  {job.nextActionDueDate && (
                    <InfoRow 
                      icon={Calendar} 
                      label="Next Action Due" 
                      value={format(new Date(job.nextActionDueDate), "MMM d, yyyy")} 
                    />
                  )}
                  {job.upcomingDate && (() => {
                    const isAwaitingParts = displayStatus?.toLowerCase().includes('awaiting parts');
                    return (
                      <InfoRow 
                        icon={isAwaitingParts ? Package : Calendar} 
                        label={isAwaitingParts ? "Parts ETA at LVC" : "Scheduled Date"} 
                        value={isAwaitingParts 
                          ? formatPartsWindow(job.upcomingDate)
                          : format(new Date(job.upcomingDate), "MMM d, yyyy")} 
                      />
                    );
                  })()}
                </div>

                <div className="mt-6 pt-6 border-t">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Description
                  </div>
                  <p className="text-sm" data-testid="text-description">{job.shortDescription}</p>
                </div>

                {job.equipment && (
                  <div className="mt-6 pt-6 border-t">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Listed Equipment
                    </div>
                    <div className="space-y-1" data-testid="text-equipment-list">
                      {job.equipment.split(';').map((item, idx) => {
                        const trimmed = item.trim();
                        if (!trimmed) return null;
                        return (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span>{trimmed}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {job.jobValueEstimate && (
                  <div className="mt-6 pt-6 border-t">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Estimated Value
                    </div>
                    <p className="text-lg font-semibold">
                      £{Number(job.jobValueEstimate).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Need Help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <a href={createJobMailtoLink('chase', job)}>
                  <Button variant="outline" className="w-full gap-2" data-testid="button-chase-job">
                    <Clock className="h-4 w-4" />
                    Chase Progress
                  </Button>
                </a>
                <a href={createJobMailtoLink('query', job)}>
                  <Button variant="outline" className="w-full gap-2" data-testid="button-query-job">
                    <MessageCircle className="h-4 w-4" />
                    Ask a Question
                  </Button>
                </a>
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Opens your email app to contact our team
                </p>
              </CardContent>
            </Card>

            {purchaseOrders.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base font-medium">Purchase Orders ({purchaseOrders.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {purchaseOrders.map((po) => (
                      <POCard key={po.id} po={po} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
