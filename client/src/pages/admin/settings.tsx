import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin-layout";

export default function AdminSettingsPage() {
  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Settings</h1>
          <p className="text-muted-foreground mt-1">System configuration and preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">System Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Support Email</span>
              <span className="font-medium">service@lvcuk.com</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data Source</span>
              <span className="font-medium">Protean Integration</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database</span>
              <span className="font-medium">PostgreSQL</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Email Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer Enquiries</span>
              <span className="font-medium">service@lvcuk.com</span>
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              Customer actions (approve quotes, chase jobs, queries) will send emails to this address.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
