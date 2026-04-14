import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useParams } from "wouter";
import { ArrowLeft, Briefcase, Save, Loader2, Package, Calendar, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Job, CustomerAccount } from "@shared/schema";

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

const overrideSchema = z.object({
  displayStatus: z.string().optional(),
  adminNotes: z.string().optional(),
  internalNotes: z.string().optional(),
  dateOverride: z.string().optional(),
});

type OverrideForm = z.infer<typeof overrideSchema>;

function EditOverrideDialog({ job, onSuccess }: { job: JobWithExtras; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<OverrideForm>({
    resolver: zodResolver(overrideSchema),
    defaultValues: {
      displayStatus: job.displayStatus || "",
      adminNotes: job.adminNotes || "",
      internalNotes: "",
      dateOverride: "",
    },
  });

  const { data: existingOverride } = useQuery<{
    displayStatus: string | null;
    adminNotes: string | null;
    internalNotes: string | null;
    dateOverride: string | null;
    statusAtOverride: string | null;
  }>({
    queryKey: ["/api/admin/overrides", job.jobId],
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async (data: OverrideForm) => {
      const response = await apiRequest("POST", "/api/admin/overrides", {
        jobId: job.jobId,
        ...data,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save override");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Job override has been saved." });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save override",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (isOpen && existingOverride) {
        form.reset({
          displayStatus: existingOverride.displayStatus || "",
          adminNotes: existingOverride.adminNotes || "",
          internalNotes: existingOverride.internalNotes || "",
          dateOverride: existingOverride.dateOverride 
            ? new Date(existingOverride.dateOverride).toISOString().split('T')[0] 
            : "",
        });
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`button-edit-override-${job.jobId}`}>
          <MessageSquare className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Job Override - {job.jobId}</DialogTitle>
          <DialogDescription>
            Add notes or override the display status for this job.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="displayStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Status (override)</FormLabel>
                  <FormControl>
                    <Input placeholder="Leave empty to use system status" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adminNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Notes (visible to customer)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notes shown to the customer..." className="min-h-[80px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes (admin only)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes..." className="min-h-[80px]" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateOverride"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date Override (Parts ETA / Visit Date)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date-override" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    Override persists until job status changes. Leave empty to use CSV data.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Override
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCustomerViewPage() {
  const params = useParams<{ accountCode: string }>();
  const accountCode = params.accountCode;

  const { data: account, isLoading: accountLoading } = useQuery<CustomerAccount>({
    queryKey: ["/api/admin/accounts", accountCode],
  });

  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<JobsResponse>({
    queryKey: ["/api/admin/jobs", { accountCode, limit: 100 }],
  });

  const jobs = jobsData?.jobs ?? [];
  const isLoading = accountLoading || jobsLoading;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/accounts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              {accountLoading ? <Skeleton className="h-8 w-48" /> : account?.accountName || accountCode}
            </h1>
            <p className="text-muted-foreground mt-1">Account Code: {accountCode}</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Jobs ({jobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No jobs found for this customer</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Job ID</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Site</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">ETA</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden lg:table-cell">Notes</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const displayStatus = job.displayStatus || job.status;
                      const isAwaitingParts = displayStatus?.toLowerCase().includes('awaiting parts');
                      return (
                        <tr 
                          key={job.id} 
                          className="border-b last:border-0"
                          data-testid={`row-job-${job.jobId}`}
                        >
                          <td className="py-4 font-medium">{job.jobId}</td>
                          <td className="py-4">
                            <div className="max-w-[200px]">
                              <div className="truncate">{job.siteName}</div>
                              <div className="text-sm text-muted-foreground truncate">{job.shortDescription}</div>
                            </div>
                          </td>
                          <td className="py-4">
                            <StatusBadge status={displayStatus} />
                          </td>
                          <td className="py-4 hidden md:table-cell">
                            {job.upcomingDate ? (
                              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                {isAwaitingParts ? (
                                  <Package className="h-3.5 w-3.5" />
                                ) : (
                                  <Calendar className="h-3.5 w-3.5" />
                                )}
                                <span>{format(new Date(job.upcomingDate), "MMM d")}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                          <td className="py-4 hidden lg:table-cell">
                            {job.adminNotes ? (
                              <span className="text-sm text-primary truncate max-w-[150px] block">{job.adminNotes}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                          <td className="py-4 text-right">
                            <EditOverrideDialog job={job} onSuccess={() => refetchJobs()} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
