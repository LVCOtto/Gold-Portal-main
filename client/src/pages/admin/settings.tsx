import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin-layout";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CommunicationSettings = {
  otpEmailSandboxEnabled: boolean;
  otpEmailSandboxRecipient: string;
  workshopTeamEmail: string;
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { data: communicationSettings, isLoading } = useQuery<CommunicationSettings>({
    queryKey: ["/api/admin/settings/communications"],
  });
  const [otpEmailSandboxEnabled, setOtpEmailSandboxEnabled] = useState(false);
  const [workshopTeamEmail, setWorkshopTeamEmail] = useState("");

  useEffect(() => {
    if (!communicationSettings) {
      return;
    }
    setOtpEmailSandboxEnabled(!!communicationSettings.otpEmailSandboxEnabled);
    setWorkshopTeamEmail(communicationSettings.workshopTeamEmail || "");
  }, [communicationSettings]);

  const mutation = useMutation({
    mutationFn: async (settings: { otpEmailSandboxEnabled: boolean; workshopTeamEmail: string }) => {
      const response = await apiRequest("PATCH", "/api/admin/settings/communications", settings);
      return response.json() as Promise<CommunicationSettings>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/communications"] });
      toast({ title: "Settings saved", description: "Communication settings have been updated." });
    },
    onError: (error) => {
      toast({
        title: "Settings not saved",
        description: error instanceof Error ? error.message : "Unable to update communication settings",
        variant: "destructive",
      });
    },
  });

  const sandboxRecipient = communicationSettings?.otpEmailSandboxRecipient || "otto@lvcuk.com";

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
            <div className="flex items-start justify-between gap-4 rounded-md border p-4">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="space-y-1">
                  <Label htmlFor="otp-email-sandbox" className="font-medium">Route customer OTP emails to admin</Label>
                  <p className="text-xs text-muted-foreground">
                    Customer login codes will be sent to {sandboxRecipient} instead of the customer's email address.
                  </p>
                </div>
              </div>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  id="otp-email-sandbox"
                  checked={otpEmailSandboxEnabled}
                  disabled={mutation.isPending}
                  onCheckedChange={setOtpEmailSandboxEnabled}
                  data-testid="switch-otp-email-sandbox"
                />
              )}
            </div>
            <div className="space-y-2 rounded-md border p-4">
              <Label htmlFor="workshop-team-email" className="font-medium">Workshop login email</Label>
              <p className="text-xs text-muted-foreground">
                The workshop team will receive their one-time login codes at this address and only be able to access the workshop T-card system.
              </p>
              <Input
                id="workshop-team-email"
                type="email"
                value={workshopTeamEmail}
                onChange={(event) => setWorkshopTeamEmail(event.target.value)}
                placeholder="workshop@lvcuk.com"
                data-testid="input-workshop-team-email"
              />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer Enquiries</span>
              <span className="font-medium">service@lvcuk.com</span>
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              Customer actions (approve quotes, chase jobs, queries) will send emails to this address.
            </p>
            <Button
              type="button"
              disabled={isLoading || mutation.isPending}
              onClick={() => mutation.mutate({ otpEmailSandboxEnabled, workshopTeamEmail: workshopTeamEmail.trim() })}
              data-testid="button-save-communication-settings"
            >
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Communication Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
