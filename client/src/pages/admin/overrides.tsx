import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Edit, X, Check, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AdminLayout } from "@/components/admin-layout";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Job, JobOverride } from "@shared/schema";

const STATUS_OPTIONS = [
  { value: "none", label: "No Override (Use System Status)" },
  { value: "Attended", label: "Attended" },
  { value: "Attended in Processing", label: "Attended in Processing" },
  { value: "Pending Engineer Visit", label: "Pending Engineer Visit" },
  { value: "Pending Visit", label: "Pending Visit" },
  { value: "Awaiting Parts for Repair", label: "Awaiting Parts for Repair" },
  { value: "Workshop Repair", label: "Workshop Repair" },
];

interface JobWithOverride extends Job {
  override: JobOverride | null;
}

interface JobsResponse {
  jobs: JobWithOverride[];
  total: number;
  page: number;
  pageSize: number;
}

interface OverrideFormData {
  jobId: string;
  displayStatus: string;
  adminNotes: string;
  internalNotes: string;
}

export default function OverridesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editingJob, setEditingJob] = useState<JobWithOverride | null>(null);
  const [formData, setFormData] = useState<OverrideFormData>({
    jobId: "",
    displayStatus: "none",
    adminNotes: "",
    internalNotes: "",
  });
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<string | null>(null);

  const { data, isLoading } = useQuery<JobsResponse>({
    queryKey: ["/api/admin/jobs", { search }],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: OverrideFormData) => {
      return apiRequest("POST", `/api/admin/overrides`, {
        jobId: data.jobId,
        displayStatus: data.displayStatus === "none" ? null : data.displayStatus,
        adminNotes: data.adminNotes || null,
        internalNotes: data.internalNotes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overrides"] });
      setEditingJob(null);
      toast({
        title: "Override saved",
        description: "The job override has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save override. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest("DELETE", `/api/admin/overrides/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overrides"] });
      setDeleteConfirmJob(null);
      toast({
        title: "Override removed",
        description: "The job override has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove override. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (job: JobWithOverride) => {
    setEditingJob(job);
    setFormData({
      jobId: job.jobId,
      displayStatus: job.override?.displayStatus || "none",
      adminNotes: job.override?.adminNotes || "",
      internalNotes: job.override?.internalNotes || "",
    });
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleDelete = (jobId: string) => {
    setDeleteConfirmJob(jobId);
  };

  const filteredJobs = data?.jobs.filter(job => 
    job.jobId.toLowerCase().includes(search.toLowerCase()) ||
    job.siteName.toLowerCase().includes(search.toLowerCase()) ||
    job.accountCode.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const jobsWithOverrides = filteredJobs.filter(j => j.override);
  const jobsWithoutOverrides = filteredJobs.filter(j => !j.override);

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Job Overrides</h1>
          <p className="text-muted-foreground mt-1">
            Override job status and add notes when the system doesn't reflect reality
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Find Job</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Job ID, site name, or account code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            {jobsWithOverrides.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    Jobs with Active Overrides ({jobsWithOverrides.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {jobsWithOverrides.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-start justify-between gap-4 p-4 rounded-md border"
                        data-testid={`row-override-${job.jobId}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium">{job.jobId}</span>
                            <span className="text-muted-foreground text-sm">|</span>
                            <span className="text-sm text-muted-foreground">{job.accountCode}</span>
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">{job.siteName}</div>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-xs text-muted-foreground">System:</span>
                            <StatusBadge status={job.status} />
                            <span className="text-xs text-muted-foreground">Override:</span>
                            <StatusBadge status={job.override?.displayStatus || job.status} />
                          </div>
                          {job.override?.adminNotes && (
                            <div className="text-sm mt-2">
                              <span className="font-medium text-xs text-muted-foreground">Customer Note:</span>
                              <p className="text-sm">{job.override.adminNotes}</p>
                            </div>
                          )}
                          {job.override?.internalNotes && (
                            <div className="text-sm mt-2">
                              <span className="font-medium text-xs text-muted-foreground">Internal Note:</span>
                              <p className="text-sm text-muted-foreground italic">{job.override.internalNotes}</p>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-2">
                            Last updated: {format(new Date(job.override!.updatedAt), "MMM d, yyyy h:mm a")}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEdit(job)}
                            data-testid={`button-edit-${job.jobId}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDelete(job.jobId)}
                            data-testid={`button-delete-${job.jobId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {search && jobsWithoutOverrides.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    Other Jobs ({jobsWithoutOverrides.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {jobsWithoutOverrides.slice(0, 10).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between gap-4 p-4 rounded-md border"
                        data-testid={`row-job-${job.jobId}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-medium">{job.jobId}</span>
                            <span className="text-muted-foreground text-sm">|</span>
                            <span className="text-sm text-muted-foreground">{job.accountCode}</span>
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">{job.siteName}</div>
                          <StatusBadge status={job.status} />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(job)}
                          data-testid={`button-add-override-${job.jobId}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Add Override
                        </Button>
                      </div>
                    ))}
                    {jobsWithoutOverrides.length > 10 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Showing first 10 results. Refine your search to find more specific jobs.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {!search && jobsWithOverrides.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No active overrides. Search for a job to add one.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Dialog open={!!editingJob} onOpenChange={(open) => !open && setEditingJob(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingJob?.override ? "Edit Override" : "Add Override"} - {editingJob?.jobId}
              </DialogTitle>
              <DialogDescription>
                {editingJob?.siteName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="status">Override Status</Label>
                <Select
                  value={formData.displayStatus}
                  onValueChange={(value) => setFormData({ ...formData, displayStatus: value })}
                >
                  <SelectTrigger id="status" data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Current system status: {editingJob?.status}
                </p>
              </div>
              <div>
                <Label htmlFor="adminNotes">Customer-Visible Note</Label>
                <Textarea
                  id="adminNotes"
                  placeholder="This note will be shown to the customer..."
                  value={formData.adminNotes}
                  onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                  rows={3}
                  data-testid="textarea-admin-notes"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Displayed as "Update from LVC" on the job detail page
                </p>
              </div>
              <div>
                <Label htmlFor="internalNotes">Internal Note (Admin Only)</Label>
                <Textarea
                  id="internalNotes"
                  placeholder="For internal tracking only..."
                  value={formData.internalNotes}
                  onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                  rows={3}
                  data-testid="textarea-internal-notes"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Only visible to admins, never shown to customers
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingJob(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save">
                {saveMutation.isPending ? "Saving..." : "Save Override"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteConfirmJob} onOpenChange={(open) => !open && setDeleteConfirmJob(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Override</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove the override for job {deleteConfirmJob}? 
                The job will revert to showing its system status.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmJob(null)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => deleteConfirmJob && deleteMutation.mutate(deleteConfirmJob)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Removing..." : "Remove Override"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
