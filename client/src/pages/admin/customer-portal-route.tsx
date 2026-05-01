import { useMemo, type ReactNode } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminLayout } from "@/components/admin-layout";
import { CustomerPortalProvider, createCustomerPortalValue } from "@/lib/customer-portal";
import type { CustomerAccount } from "@shared/schema";

export function AdminCustomerPortalRoute({ children }: { children: ReactNode }) {
  const params = useParams<{ accountCode: string }>();
  const accountCode = params.accountCode ? decodeURIComponent(params.accountCode) : "";

  const { data: account, isLoading, error } = useQuery<CustomerAccount>({
    queryKey: ["/api/admin/accounts", accountCode],
    enabled: !!accountCode,
  });

  const portalValue = useMemo(
    () => createCustomerPortalValue({
      mode: "admin",
      accountCode: account?.accountCode || accountCode,
      accountName: account?.accountName || accountCode,
    }),
    [account?.accountCode, account?.accountName, accountCode],
  );

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[320px] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading customer account
        </div>
      </AdminLayout>
    );
  }

  if (error || !account) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-xl py-16 text-center">
          <h1 className="text-xl font-semibold">Customer Not Found</h1>
          <p className="mt-2 text-muted-foreground">The selected customer account could not be found.</p>
          <Link href="/admin/accounts">
            <Button variant="outline" className="mt-6">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Accounts
            </Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return <CustomerPortalProvider value={portalValue}>{children}</CustomerPortalProvider>;
}
