import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Job } from "@shared/schema";

const overrideSchema = z.object({
  displayStatus: z.string().optional(),
  adminNotes: z.string().optional(),
  internalNotes: z.string().optional(),
  dateOverride: z.string().optional(),
});

type OverrideForm = z.infer<typeof overrideSchema>;

type JobWithOverrideFields = Job & {
  displayStatus?: string | null;
  adminNotes?: string | null;
};

interface ExistingOverride {
  displayStatus: string | null;
  adminNotes: string | null;
  internalNotes: string | null;
  dateOverride: string | null;
  statusAtOverride: string | null;
}

function formatDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0];
}

export function JobOverrideDialog({
  job,
  trigger,
  onSuccess,
}: {
  job: JobWithOverrideFields;
  trigger?: ReactNode;
  onSuccess?: () => void;
}) {
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

  const { data: existingOverride } = useQuery<ExistingOverride | null>({
    queryKey: ["/api/admin/overrides", job.jobId],
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;

    form.reset({
      displayStatus: existingOverride?.displayStatus || job.displayStatus || "",
      adminNotes: existingOverride?.adminNotes || job.adminNotes || "",
      internalNotes: existingOverride?.internalNotes || "",
      dateOverride: formatDateInput(existingOverride?.dateOverride),
    });
  }, [existingOverride, form, job.adminNotes, job.displayStatus, open]);

  const mutation = useMutation({
    mutationFn: async (data: OverrideForm) => {
      const response = await apiRequest("POST", "/api/admin/overrides", {
        jobId: job.jobId,
        ...data,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Job override has been saved." });
      setOpen(false);
      queryClient.invalidateQueries();
      onSuccess?.();
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" aria-label={`Edit override for job ${job.jobId}`} data-testid={`button-edit-override-${job.jobId}`}>
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Job Override - {job.jobId}</DialogTitle>
          <DialogDescription>Add notes or override the customer-facing status and ETA for this job.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="displayStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Status</FormLabel>
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
                  <FormLabel>Customer Note</FormLabel>
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
                  <FormLabel>Internal Note</FormLabel>
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
                  <FormLabel>ETA / Scheduled Date Override</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-date-override" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    This date is used until the imported job status changes. Leave empty to use CSV data.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-override">
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
