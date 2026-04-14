import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Users, RotateCcw, Loader2, Search, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AdminLayout } from "@/components/admin-layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { CustomerAccount } from "@shared/schema";

const resetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

function ResetPasswordDialog({ account, onSuccess }: { account: CustomerAccount; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ResetPasswordForm) => {
      const response = await apiRequest("PATCH", `/api/admin/accounts/${account.accountCode}/password`, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reset password");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Password Reset", description: "The password has been updated successfully." });
      form.reset();
      setOpen(false);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`button-reset-password-${account.accountCode}`}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Set a new password for {account.accountName} ({account.accountCode})
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password (required)</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Minimum 6 characters" {...field} data-testid="input-new-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-reset">
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset Password
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminAccountsPage() {
  const [search, setSearch] = useState("");

  const { data: accounts, isLoading, refetch } = useQuery<CustomerAccount[]>({
    queryKey: ["/api/admin/accounts", { search }],
  });

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Customer Accounts</h1>
            <p className="text-muted-foreground mt-1">View customer accounts and manage portal access</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
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
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : accounts?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No accounts found</p>
                <p className="text-sm mt-1">Customer accounts are created automatically when job data is imported</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Account Code</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">Account Name</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Created</th>
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts?.map((account) => (
                      <tr 
                        key={account.id} 
                        className="border-b last:border-0"
                        data-testid={`row-account-${account.accountCode}`}
                      >
                        <td className="py-4 font-medium">{account.accountCode}</td>
                        <td className="py-4">{account.accountName}</td>
                        <td className="py-4 text-sm text-muted-foreground hidden sm:table-cell">
                          {format(new Date(account.createdAt), "MMM d, yyyy")}
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/admin/customer/${account.accountCode}`}>
                              <Button variant="ghost" size="sm" data-testid={`button-view-${account.accountCode}`}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <ResetPasswordDialog account={account} onSuccess={() => refetch()} />
                          </div>
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
    </AdminLayout>
  );
}
