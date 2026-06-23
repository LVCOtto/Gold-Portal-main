import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Plus, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CommsLayout } from "./layout";
import { format } from "date-fns";

interface Template {
  id: string;
  displayName: string;
  routeKey: string;
  subject: string;
  body: string;
  tone: string | null;
  operatorNotes: string | null;
  defaultCooldownDays: number;
  enabled: boolean;
  sortOrder: number;
  updatedBy: string | null;
  updatedAt: string;
}

const AVAILABLE_TOKENS = [
  "jobId", "clientName", "siteName", "jobType", "status", "priority",
  "shortDescription", "engineerName", "lastVisitDate", "nextActionDueDate",
  "commsStatus", "lastCommsSentAt", "nextCommsDueAt", "today", "portalUrl",
];

export default function CommsTemplatesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Template>>({});

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/comms/templates"],
    queryFn: async () => {
      const res = await fetch("/api/comms/templates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load templates");
      return res.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Template> }) =>
      apiRequest("PATCH", `/api/comms/templates/${id}`, patch),
    onSuccess: () => {
      toast({ title: "Template saved" });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["/api/comms/templates"] });
    },
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/comms/templates/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/comms/templates"] }),
    onError: (err) => toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" }),
  });

  function startEdit(template: Template) {
    setEditingId(template.id);
    setEditForm({
      displayName: template.displayName,
      routeKey: template.routeKey,
      subject: template.subject,
      body: template.body,
      tone: template.tone,
      operatorNotes: template.operatorNotes,
      defaultCooldownDays: template.defaultCooldownDays,
    });
  }

  function saveEdit() {
    if (!editingId) return;
    patchMutation.mutate({ id: editingId, patch: editForm });
  }

  return (
    <CommsLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Templates</h1>
            <p className="text-sm text-muted-foreground">Manage automated message templates</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowTokens(!showTokens)}
          >
            {showTokens ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showTokens ? "Hide" : "Show"} tokens
          </Button>
        </div>

        {showTokens && (
          <Card className="bg-muted/40">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm">Available tokens — use {`{{token}}`} syntax</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_TOKENS.map((t) => (
                  <code key={t} className="text-xs bg-background border rounded px-2 py-0.5 font-mono">{`{{${t}}}`}</code>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />Loading…
          </div>
        ) : (
          <div className="space-y-3">
            {(templates ?? []).map((template) => (
              <Card key={template.id} className={template.enabled ? "" : "opacity-60"}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{template.displayName}</CardTitle>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{template.id}</code>
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{template.routeKey}</span>
                        {template.tone && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{template.tone}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cooldown: {template.defaultCooldownDays} days · Last updated {format(new Date(template.updatedAt), "dd/MM/yyyy")} by {template.updatedBy ?? "system"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={template.enabled}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: template.id, enabled: v })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editingId === template.id ? setEditingId(null) : startEdit(template)}
                      >
                        {editingId === template.id ? "Cancel" : "Edit"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {editingId === template.id ? (
                  <CardContent className="pt-0 space-y-4 border-t">
                    <div className="grid grid-cols-2 gap-4 pt-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Display name</Label>
                        <Input
                          value={editForm.displayName ?? ""}
                          onChange={(e) => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Route key</Label>
                        <Input
                          value={editForm.routeKey ?? ""}
                          onChange={(e) => setEditForm(f => ({ ...f, routeKey: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Tone</Label>
                        <Select
                          value={editForm.tone ?? ""}
                          onValueChange={(v) => setEditForm(f => ({ ...f, tone: v || null }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Select tone" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="formal">Formal</SelectItem>
                            <SelectItem value="friendly">Friendly</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Default cooldown (days)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={editForm.defaultCooldownDays ?? 7}
                          onChange={(e) => setEditForm(f => ({ ...f, defaultCooldownDays: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Subject</Label>
                      <Input
                        value={editForm.subject ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, subject: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Body</Label>
                      <Textarea
                        rows={10}
                        value={editForm.body ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, body: e.target.value }))}
                        className="font-mono text-xs resize-y"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Operator notes (internal)</Label>
                      <Textarea
                        rows={2}
                        value={editForm.operatorNotes ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, operatorNotes: e.target.value }))}
                        className="resize-none"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button onClick={saveEdit} disabled={patchMutation.isPending}>
                        {patchMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save template
                      </Button>
                    </div>
                  </CardContent>
                ) : (
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Subject:</p>
                    <p className="text-sm text-foreground mb-3">{template.subject}</p>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Body preview:</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{template.body}</p>
                    {template.operatorNotes && (
                      <p className="text-xs text-muted-foreground/70 mt-2 italic">Note: {template.operatorNotes}</p>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </CommsLayout>
  );
}
