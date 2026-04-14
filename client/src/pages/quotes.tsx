import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Search, Filter, ArrowRight, FileText, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerLayout } from "@/components/customer-layout";
import { StatusBadge } from "@/components/status-badge";
import { format } from "date-fns";
import type { Quote } from "@shared/schema";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "awaiting_approval", label: "Awaiting Approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

interface QuotesResponse {
  quotes: Quote[];
  total: number;
  page: number;
  pageSize: number;
}

export default function QuotesPage() {
  const searchParams = useSearch();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(searchParams).get("status") || "all");

  const { data, isLoading } = useQuery<QuotesResponse>({
    queryKey: ["/api/quotes", { page, search, status: statusFilter }],
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Quotes</h1>
            <p className="text-muted-foreground mt-1">View and approve your quotations</p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.href = "/api/export/quotes"}
            data-testid="button-export-quotes"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by quote ID or job ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-status">
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
            ) : data?.quotes.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No quotes found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Quote ID</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Job ID</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">Date</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground text-right">Total</th>
                        <th className="pb-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.quotes.map((quote) => (
                        <tr 
                          key={quote.id} 
                          className="border-b last:border-0 hover-elevate"
                          data-testid={`row-quote-${quote.quoteId}`}
                        >
                          <td className="py-4">
                            <span className="font-medium">{quote.quoteId}</span>
                          </td>
                          <td className="py-4">
                            {quote.jobId ? (
                              <Link href={`/jobs/${quote.jobId}`} className="text-primary hover:underline">
                                {quote.jobId}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-4">
                            <StatusBadge status={quote.quoteStatus} />
                          </td>
                          <td className="py-4 text-sm text-muted-foreground hidden md:table-cell">
                            {format(new Date(quote.quoteDate), "MMM d, yyyy")}
                          </td>
                          <td className="py-4 text-right font-medium">
                            £{Number(quote.grossTotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-4">
                            <Link href={`/quotes/${quote.quoteId}`}>
                              <Button variant="ghost" size="icon" data-testid={`button-view-${quote.quoteId}`}>
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((page - 1) * (data?.pageSize ?? 10)) + 1} - {Math.min(page * (data?.pageSize ?? 10), data?.total ?? 0)} of {data?.total ?? 0} quotes
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
