import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Link } from "wouter";
import { Users, Loader2, Search, Eye, Save } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin-layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { CustomerAccount } from "@shared/schema";

const emailSchema = z.object({
  email: z.string().trim().refine((email) => email === "" || z.string().email().safeParse(email).success, {
    message: "Enter a valid email address",
  }),
});

function AccountEmailInput({ account }: { account: CustomerAccount }) {
  const { toast } = useToast();
  const [email, setEmail] = useState(account.email || "");

  const normalizedCurrentEmail = account.email || "";
  const hasChanged = email.trim() !== normalizedCurrentEmail;

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = emailSchema.safeParse({ email });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || "Enter a valid email address");
      }
      const response = await apiRequest("PATCH", `/api/admin/accounts/${encodeURIComponent(account.accountCode)}/email`, parsed.data);
      return response.json();
    },
    onSuccess: (data: { email: string | null }) => {
      setEmail(data.email || "");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/accounts"] });
      toast({ title: "Email saved", description: "This address will be used for customer login codes." });
    },
    onError: (error) => {
      toast({
        title: "Email not saved",
        description: error instanceof Error ? error.message : "Failed to update email address",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex min-w-[260px] items-center gap-2">
      <Input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && hasChanged && !mutation.isPending) {
            mutation.mutate();
          }
        }}
        placeholder="customer@example.com"
        className="h-9"
        data-testid={`input-account-email-${account.accountCode}`}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 px-3"
        disabled={!hasChanged || mutation.isPending}
        onClick={() => mutation.mutate()}
        data-testid={`button-save-email-${account.accountCode}`}
        aria-label={`Save email for ${account.accountCode}`}
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function AdminAccountsPage() {
  const [search, setSearch] = useState("");

  const { data: accounts, isLoading } = useQuery<CustomerAccount[]>({
    queryKey: ["/api/admin/accounts", { search }],
  });

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-6xl">
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
                      <th className="pb-3 font-medium text-xs uppercase tracking-wide text-muted-foreground">OTP Email</th>
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
                        <td className="py-4"><AccountEmailInput account={account} /></td>
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
