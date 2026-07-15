import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare, PhoneCall, ShieldAlert, Wrench } from "lucide-react";
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

type InternalAccessUser = {
  id: string;
  email: string;
  displayName: string | null;
  canAdmin: boolean;
  canWorkshop: boolean;
  canComms: boolean;
  canCallbacks: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
};

type NewInternalAccessUser = {
  email: string;
  displayName: string;
  canAdmin: boolean;
  canWorkshop: boolean;
  canComms: boolean;
  canCallbacks: boolean;
  isActive: boolean;
};

function formatLastLogin(value: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Never";
  return parsed.toLocaleString();
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { data: communicationSettings, isLoading } = useQuery<CommunicationSettings>({
    queryKey: ["/api/admin/settings/communications"],
  });
  const { data: internalAccessData, isLoading: isInternalAccessLoading } = useQuery<{ users: InternalAccessUser[] }>({
    queryKey: ["/api/admin/settings/internal-access"],
    queryFn: async () => {
      const response = await fetch("/api/admin/settings/internal-access", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to load internal access settings");
      }
      return response.json();
    },
  });
  const [otpEmailSandboxEnabled, setOtpEmailSandboxEnabled] = useState(false);
  const [workshopTeamEmail, setWorkshopTeamEmail] = useState("");
  const [internalAccessDrafts, setInternalAccessDrafts] = useState<InternalAccessUser[]>([]);
  const [newInternalAccessUser, setNewInternalAccessUser] = useState<NewInternalAccessUser>({
    email: "",
    displayName: "",
    canAdmin: false,
    canWorkshop: true,
    canComms: false,
    canCallbacks: false,
    isActive: true,
  });

  useEffect(() => {
    if (!communicationSettings) {
      return;
    }
    setOtpEmailSandboxEnabled(!!communicationSettings.otpEmailSandboxEnabled);
    setWorkshopTeamEmail(communicationSettings.workshopTeamEmail || "");
  }, [communicationSettings]);

  useEffect(() => {
    setInternalAccessDrafts(internalAccessData?.users || []);
  }, [internalAccessData]);

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

  const createInternalAccessMutation = useMutation({
    mutationFn: async (payload: NewInternalAccessUser) => {
      const response = await apiRequest("POST", "/api/admin/settings/internal-access", payload);
      return response.json() as Promise<{ user: InternalAccessUser }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/internal-access"] });
      setNewInternalAccessUser({ email: "", displayName: "", canAdmin: false, canWorkshop: true, canComms: false, canCallbacks: false, isActive: true });
      toast({ title: "Internal access saved", description: "The internal user has been added or updated." });
    },
    onError: (error) => {
      toast({
        title: "Internal access not saved",
        description: error instanceof Error ? error.message : "Unable to save internal access",
        variant: "destructive",
      });
    },
  });

  const updateInternalAccessMutation = useMutation({
    mutationFn: async (payload: InternalAccessUser) => {
      const response = await apiRequest("PATCH", `/api/admin/settings/internal-access/${payload.id}`, {
        displayName: payload.displayName || "",
        canAdmin: payload.canAdmin,
        canWorkshop: payload.canWorkshop,
        canComms: payload.canComms,
        canCallbacks: payload.canCallbacks,
        isActive: payload.isActive,
      });
      return response.json() as Promise<{ user: InternalAccessUser }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/internal-access"] });
      toast({ title: "Internal access updated", description: "Permissions have been saved." });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unable to update internal access",
        variant: "destructive",
      });
    },
  });

  function updateDraft(id: string, patch: Partial<InternalAccessUser>) {
    setInternalAccessDrafts((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  const sandboxRecipient = communicationSettings?.otpEmailSandboxRecipient || "otto@lvcuk.com";
  const workshopLoginUrl = typeof window !== "undefined" ? `${window.location.origin}/workshop/login` : "/workshop/login";

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
              <Label htmlFor="workshop-team-email" className="font-medium">Legacy workshop fallback email</Label>
              <p className="text-xs text-muted-foreground">
                This fallback address still works during migration, but new Workshop and Comms access should be managed in the internal access list below.
              </p>
              <Input
                id="workshop-team-email"
                type="email"
                value={workshopTeamEmail}
                onChange={(event) => setWorkshopTeamEmail(event.target.value)}
                placeholder="workshop@lvcuk.com"
                data-testid="input-workshop-team-email"
              />
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-2">
                <p>
                  Immediate workshop link: <span className="font-medium text-foreground">{workshopLoginUrl}</span>
                </p>
                <p>
                  Railway only gives one automatic <span className="font-medium text-foreground">.up.railway.app</span> domain per service. If you later attach a dedicated host such as <span className="font-medium text-foreground">workshop.yourdomain.com</span> and set <span className="font-medium text-foreground">WORKSHOP_PUBLIC_HOST</span>, that host will redirect straight into the workshop login flow.
                </p>
              </div>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Internal Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            <div className="rounded-md border p-4 space-y-4">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Add internal user</p>
                <p className="text-xs text-muted-foreground">
                  Grant one-time-code access to the Workshop portal, the Comms portal, or both. These users do not get customer portal access.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="internal-access-email">Email address</Label>
                  <Input
                    id="internal-access-email"
                    type="email"
                    value={newInternalAccessUser.email}
                    onChange={(event) => setNewInternalAccessUser((current) => ({ ...current, email: event.target.value }))}
                    placeholder="name@company.com"
                    data-testid="input-internal-access-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internal-access-display-name">Display name</Label>
                  <Input
                    id="internal-access-display-name"
                    value={newInternalAccessUser.displayName}
                    onChange={(event) => setNewInternalAccessUser((current) => ({ ...current, displayName: event.target.value }))}
                    placeholder="Optional"
                    data-testid="input-internal-access-display-name"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8">
                <div className="flex items-center justify-between gap-4 md:min-w-52">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="new-internal-admin">Admin</Label>
                  </div>
                  <Switch
                    id="new-internal-admin"
                    checked={newInternalAccessUser.canAdmin}
                    onCheckedChange={(checked) => setNewInternalAccessUser((current) => ({ ...current, canAdmin: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 md:min-w-52">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="new-internal-workshop">Workshop</Label>
                  </div>
                  <Switch
                    id="new-internal-workshop"
                    checked={newInternalAccessUser.canWorkshop}
                    onCheckedChange={(checked) => setNewInternalAccessUser((current) => ({ ...current, canWorkshop: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 md:min-w-52">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="new-internal-comms">Comms</Label>
                  </div>
                  <Switch
                    id="new-internal-comms"
                    checked={newInternalAccessUser.canComms}
                    onCheckedChange={(checked) => setNewInternalAccessUser((current) => ({ ...current, canComms: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 md:min-w-52">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="new-internal-callbacks">Callbacks</Label>
                  </div>
                  <Switch
                    id="new-internal-callbacks"
                    checked={newInternalAccessUser.canCallbacks}
                    onCheckedChange={(checked) => setNewInternalAccessUser((current) => ({ ...current, canCallbacks: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 md:min-w-44">
                  <Label htmlFor="new-internal-active">Active</Label>
                  <Switch
                    id="new-internal-active"
                    checked={newInternalAccessUser.isActive}
                    onCheckedChange={(checked) => setNewInternalAccessUser((current) => ({ ...current, isActive: checked }))}
                  />
                </div>
              </div>
              <Button
                type="button"
                disabled={createInternalAccessMutation.isPending}
                onClick={() => createInternalAccessMutation.mutate(newInternalAccessUser)}
                data-testid="button-add-internal-access"
              >
                {createInternalAccessMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Internal User
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="font-medium text-foreground">Current internal users</p>
                <p className="text-xs text-muted-foreground">
                  Workshop sign-in: {workshopLoginUrl}. Comms sign-in: /comms/login. Callbacks sign-in: /callbacks/login.
                </p>
              </div>

              {isInternalAccessLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading internal users...
                </div>
              ) : internalAccessDrafts.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-muted-foreground">
                  No internal users have been configured yet.
                </div>
              ) : (
                internalAccessDrafts.map((user) => (
                  <div key={user.id} className="rounded-md border p-4 space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-medium text-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">Last login: {formatLastLogin(user.lastLoginAt)}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={updateInternalAccessMutation.isPending}
                        onClick={() => updateInternalAccessMutation.mutate(user)}
                        data-testid={`button-save-internal-access-${user.id}`}
                      >
                        {updateInternalAccessMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`display-name-${user.id}`}>Display name</Label>
                      <Input
                        id={`display-name-${user.id}`}
                        value={user.displayName || ""}
                        onChange={(event) => updateDraft(user.id, { displayName: event.target.value })}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8">
                      <div className="flex items-center justify-between gap-4 md:min-w-52">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor={`admin-${user.id}`}>Admin</Label>
                        </div>
                        <Switch
                          id={`admin-${user.id}`}
                          checked={user.canAdmin}
                          onCheckedChange={(checked) => updateDraft(user.id, { canAdmin: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 md:min-w-52">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor={`workshop-${user.id}`}>Workshop</Label>
                        </div>
                        <Switch
                          id={`workshop-${user.id}`}
                          checked={user.canWorkshop}
                          onCheckedChange={(checked) => updateDraft(user.id, { canWorkshop: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 md:min-w-52">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor={`comms-${user.id}`}>Comms</Label>
                        </div>
                        <Switch
                          id={`comms-${user.id}`}
                          checked={user.canComms}
                          onCheckedChange={(checked) => updateDraft(user.id, { canComms: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 md:min-w-52">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="h-4 w-4 text-muted-foreground" />
                          <Label htmlFor={`callbacks-${user.id}`}>Callbacks</Label>
                        </div>
                        <Switch
                          id={`callbacks-${user.id}`}
                          checked={user.canCallbacks}
                          onCheckedChange={(checked) => updateDraft(user.id, { canCallbacks: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 md:min-w-44">
                        <Label htmlFor={`active-${user.id}`}>Active</Label>
                        <Switch
                          id={`active-${user.id}`}
                          checked={user.isActive}
                          onCheckedChange={(checked) => updateDraft(user.id, { isActive: checked })}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
