import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Search, Filter, ArrowRight, Briefcase, ChevronLeft, ChevronRight, MessageSquare, Calendar, Package, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CustomerLayout } from "@/components/customer-layout";
import { StatusBadge } from "@/components/status-badge";
import { format, addDays, isWeekend } from "date-fns";
import type { Job } from "@shared/schema";

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
  return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d")}`;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "Attended", label: "Attended" },
  { value: "Attended in Processing", label: "Attended in Processing" },
  { value: "Pending Engineer Visit", label: "Pending Engineer Visit" },
  { value: "Pending Visit", label: "Pending Visit" },
  { value: "Awaiting Parts for Repair", label: "Awaiting Parts for Repair" },
  { value: "Workshop Repair", label: "Workshop Repair" },
];

interface JobWithOverride extends Job {
  displayStatus: string | null;
  adminNotes: string | null;
  upcomingDate: string | null;
  upcomingDateType: 'parts' | 'visit' | null;
}

interface JobsResponse {
  jobs: JobWithOverride[];
  total: number;
  page: number;
  pageSize: number;
}

type SortField = 'jobId' | 'siteName' | 'status' | 'lastUpdatedDate';
type SortOrder = 'asc' | 'desc';

const SORT_STORAGE_KEY = 'lvc-jobs-sort';

function getSavedSort(): { sortBy: SortField; sortOrder: SortOrder } {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.sortBy && parsed.sortOrder) {
        return parsed;
      }
    }
  } catch {}
  return { sortBy: 'lastUpdatedDate', sortOrder: 'desc' };
}

function SortableHeader({ 
  label, 
  field, 
  currentSort, 
  currentOrder, 
  onSort,
  className = ""
}: { 
  label: string; 
  field: SortField; 
  currentSort: SortField; 
  currentOrder: SortOrder;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentSort === field;
  return (
    <th 
      className={`pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => onSort(field)}
      data-testid={`sort-${field}`}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isActive ? (
          currentOrder === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </div>
    </th>
  );
}

export default function JobsPage() {
  const searchParams = useSearch();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(searchParams).get("status") || "all");
  
  const [sortBy, setSortBy] = useState<SortField>(() => getSavedSort().sortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => getSavedSort().sortOrder);

  // Persist sort preferences
  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ sortBy, sortOrder }));
  }, [sortBy, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const { data, isLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/jobs", { page, search, status: statusFilter, sortBy, sortOrder }],
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Jobs</h1>
            <p className="text-muted-foreground mt-1">View and track all your service jobs</p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.href = `/api/export/jobs/pdf?sortBy=${sortBy}&sortOrder=${sortOrder}`}
            data-testid="button-export-jobs-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by job ID, site, or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]" data-testid="select-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : data?.jobs.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No jobs found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <SortableHeader label="Job ID" field="jobId" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                        <SortableHeader label="Site" field="siteName" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                        <SortableHeader label="Status" field="status" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} />
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden lg:table-cell">ETA / Scheduled</th>
                        <SortableHeader label="Last Updated" field="lastUpdatedDate" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Update</th>
                        <th className="pb-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.jobs.map((job) => {
                        const displayStatus = job.displayStatus || job.status;
                        return (
                          <tr 
                            key={job.id} 
                            className="border-b last:border-0 hover-elevate"
                            data-testid={`row-job-${job.jobId}`}
                          >
                            <td className="py-4">
                              <span className="font-medium">{job.jobId}</span>
                            </td>
                            <td className="py-4">
                              <div className="max-w-[400px]">
                                <div className="font-medium truncate">{job.siteName}</div>
                                <div className="text-sm text-muted-foreground truncate">{job.shortDescription}</div>
                              </div>
                            </td>
                            <td className="py-4">
                              <StatusBadge status={displayStatus} />
                            </td>
                            <td className="py-4 hidden lg:table-cell">
                              {job.upcomingDate ? (() => {
                                const isAwaitingParts = displayStatus?.toLowerCase().includes('awaiting parts');
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-1.5 text-sm">
                                        {isAwaitingParts ? (
                                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                        ) : (
                                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                        <span>
                                          {isAwaitingParts 
                                            ? formatPartsWindow(job.upcomingDate)
                                            : format(new Date(job.upcomingDate), "MMM d, yyyy")}
                                        </span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {isAwaitingParts 
                                        ? 'Parts ETA' 
                                        : 'Scheduled date'}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })() : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="py-4 text-sm text-muted-foreground hidden md:table-cell">
                              {format(new Date(job.lastUpdatedDate), "MMM d, yyyy")}
                            </td>
                            <td className="py-4 hidden sm:table-cell">
                              {job.adminNotes ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 text-primary cursor-help">
                                      <MessageSquare className="h-4 w-4" />
                                      <span className="text-xs">Update</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    <p className="text-sm">{job.adminNotes}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="py-4">
                              <Link href={`/jobs/${job.jobId}`}>
                                <Button variant="ghost" size="icon" data-testid={`button-view-${job.jobId}`}>
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((page - 1) * (data?.pageSize ?? 10)) + 1} - {Math.min(page * (data?.pageSize ?? 10), data?.total ?? 0)} of {data?.total ?? 0} jobs
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
