import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AdminLayout } from "@/components/admin-layout";
import { format } from "date-fns";
import type { ApprovalEvent } from "@shared/schema";

interface ApprovalsResponse {
  approvals: ApprovalEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export default function AdminApprovalsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<ApprovalsResponse>({
    queryKey: ["/api/admin/approvals", { page, search }],
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  const handleExport = () => {
    window.location.href = `/api/admin/approvals/export?search=${encodeURIComponent(search)}`;
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Quote Approvals</h1>
            <p className="text-muted-foreground mt-1">View and export customer approvals</p>
          </div>
          <Button variant="outline" onClick={handleExport} data-testid="button-export">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by account code, quote ID, or job ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : data?.approvals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No approvals found</p>
                <p className="text-sm mt-1">Approvals will appear here when customers approve quotes</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Quote ID</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Job ID</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Account</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">Approver</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden lg:table-cell">PO Number</th>
                        <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.approvals.map((approval) => (
                        <tr 
                          key={approval.id} 
                          className="border-b last:border-0"
                          data-testid={`row-approval-${approval.id}`}
                        >
                          <td className="py-4">
                            <span className="font-medium">{approval.quoteId}</span>
                          </td>
                          <td className="py-4">
                            {approval.jobId || <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-4">
                            <Badge variant="outline">{approval.accountCode}</Badge>
                          </td>
                          <td className="py-4 hidden md:table-cell">
                            <div>
                              <div className="font-medium text-sm">{approval.approverName}</div>
                              <div className="text-xs text-muted-foreground">{approval.approverEmail}</div>
                            </div>
                          </td>
                          <td className="py-4 hidden lg:table-cell">
                            {approval.customerPoNumber || <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="py-4 text-sm text-muted-foreground">
                            {format(new Date(approval.capturedAt), "MMM d, yyyy")}
                            <div className="text-xs">{format(new Date(approval.capturedAt), "h:mm a")}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((page - 1) * (data?.pageSize ?? 10)) + 1} - {Math.min(page * (data?.pageSize ?? 10), data?.total ?? 0)} of {data?.total ?? 0} approvals
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
    </AdminLayout>
  );
}
