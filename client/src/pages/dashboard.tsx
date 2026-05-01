import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Briefcase, Clock, Package, CheckCircle, ArrowRight, Search, Download, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerLayout } from "@/components/customer-layout";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { useCustomerPortal } from "@/lib/customer-portal";
import { format } from "date-fns";
import type { Job } from "@shared/schema";
import { useState } from "react";

interface DashboardStats {
  openJobs: number;
  awaitingApproval: number;
  awaitingParts: number;
  recentlyClosed: number;
}

interface JobWithExtras extends Job {
  upcomingDate?: string | null;
  upcomingDateType?: 'parts' | 'visit' | null;
  displayStatus?: string | null;
  adminNotes?: string | null;
}

interface JobsResponse {
  jobs: JobWithExtras[];
  total: number;
  page: number;
  pageSize: number;
}

function MetricTile({ 
  title, 
  value, 
  icon: Icon, 
  href,
  isLoading,
  accentColor = "primary"
}: { 
  title: string; 
  value: number; 
  icon: typeof Briefcase;
  href: string;
  isLoading: boolean;
  accentColor?: "primary" | "accent" | "muted";
}) {
  const iconBgClass = accentColor === "primary" 
    ? "bg-primary/10 text-primary" 
    : accentColor === "accent" 
      ? "bg-accent/10 text-accent" 
      : "bg-muted text-muted-foreground";
  
  return (
    <Link
      href={href}
      className="block"
      data-testid={`tile-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Card className="h-36 hover-elevate cursor-pointer shadow-sm">
        <CardContent className="flex flex-col justify-between h-full p-6">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground leading-tight">{title}</span>
            <div className={`p-2 rounded-md ${iconBgClass}`}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <span className="text-4xl font-bold tracking-tight">{value}</span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function RecentJobsTable({ jobs, isLoading }: { jobs: JobWithExtras[]; isLoading: boolean }) {
  const portal = useCustomerPortal();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No jobs found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const displayStatus = job.displayStatus || job.status;
        return (
          <Link
            key={job.id}
            href={portal.routes.jobDetail(job.jobId)}
            className="flex items-center justify-between p-4 rounded-md bg-card border hover-elevate"
            data-testid={`row-job-${job.jobId}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{job.jobId}</span>
                <StatusBadge status={displayStatus} />
                <PriorityBadge priority={job.priority} />
              </div>
              <div className="text-sm text-muted-foreground truncate mt-1">
                {job.siteName} - {job.shortDescription}
              </div>
            </div>
            <div className="flex items-center gap-4 ml-4">
              {job.upcomingDate && (
                <div className="text-right text-sm hidden sm:block">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {displayStatus?.toLowerCase().includes('awaiting parts') ? (
                      <Package className="h-3.5 w-3.5" />
                    ) : (
                      <Calendar className="h-3.5 w-3.5" />
                    )}
                    <span>{format(new Date(job.upcomingDate), "MMM d")}</span>
                  </div>
                </div>
              )}
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const portal = useCustomerPortal();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: [portal.api.dashboardStats, portal.accountParams],
  });

  const { data: recentJobsData, isLoading: jobsLoading } = useQuery<JobsResponse>({
    queryKey: [portal.api.jobs, portal.withAccountParams({ limit: 5, search: searchQuery })],
  });
  
  const recentJobs = recentJobsData?.jobs ?? [];

  return (
    <CustomerLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Overview of your jobs and quotes</p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.href = portal.api.exportJobsPdf()}
            data-testid="button-export-jobs-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricTile
            title="Open Jobs"
            value={stats?.openJobs ?? 0}
            icon={Briefcase}
            href={portal.routes.jobsWithStatus("open")}
            isLoading={statsLoading}
            accentColor="primary"
          />
          <MetricTile
            title="Awaiting Approval"
            value={stats?.awaitingApproval ?? 0}
            icon={Clock}
            href={portal.routes.jobsWithStatus("quoted")}
            isLoading={statsLoading}
            accentColor="accent"
          />
          <MetricTile
            title="Awaiting Parts"
            value={stats?.awaitingParts ?? 0}
            icon={Package}
            href={portal.routes.jobsWithStatus("awaiting_parts")}
            isLoading={statsLoading}
            accentColor="primary"
          />
          <MetricTile
            title="Recently Closed"
            value={stats?.recentlyClosed ?? 0}
            icon={CheckCircle}
            href={portal.routes.jobsWithStatus("closed")}
            isLoading={statsLoading}
            accentColor="muted"
          />
        </div>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
            <CardTitle className="text-lg font-semibold">Recent Jobs</CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-jobs"
              />
            </div>
          </CardHeader>
          <CardContent>
            <RecentJobsTable jobs={recentJobs} isLoading={jobsLoading} />
            
            <div className="mt-4 text-center">
              <Link href={portal.routes.jobs}>
                <Button variant="outline" data-testid="button-view-all-jobs">
                  View All Jobs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
