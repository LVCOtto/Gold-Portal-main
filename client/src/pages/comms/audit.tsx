import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CommsLayout } from "./layout";
import { format } from "date-fns";
import { Link } from "wouter";

interface AuditEntry {
  id: string;
  externalJobId: string;
  triggerType: string;
  templateId: string | null;
  renderedSubject: string | null;
  renderedBody: string | null;
  recipientEmail: string | null;
  outcome: string;
  errorMessage: string | null;
  operatorId: string | null;
  sentAt: string | null;
  createdAt: string;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const colours: Record<string, string> = {
    sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    suppressed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    skipped: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colours[outcome] ?? colours.skipped}`}>
      {outcome}
    </span>
  );
}

export default function CommsAuditPage() {
  const [jobIdFilter, setJobIdFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [triggerFilter, setTriggerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/comms/audit", jobIdFilter, outcomeFilter, triggerFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (jobIdFilter) params.set("jobId", jobIdFilter);
      if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);
      if (triggerFilter !== "all") params.set("triggerType", triggerFilter);
      const res = await fetch(`/api/comms/audit?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load audit log");
      return res.json() as Promise<{ entries: AuditEntry[]; total: number }>;
    },
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function fmtDate(d: string | null): string {
    if (!d) return "—";
    return format(new Date(d), "dd/MM/yyyy HH:mm");
  }

  return (
    <CommsLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">{total} records — all automated and manual communications</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Job ID..."
              value={jobIdFilter}
              onChange={(e) => { setJobIdFilter(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={outcomeFilter} onValueChange={(v) => { setOutcomeFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <Select value={triggerFilter} onValueChange={(v) => { setTriggerFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All triggers</SelectItem>
              <SelectItem value="auto">Automated</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Job ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Trigger</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Template</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Recipient</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Outcome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Operator</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin inline mr-2" />Loading…
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No records found</td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <>
                      <tr
                        key={entry.id}
                        className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(entry.createdAt)}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <Link
                            href={`/comms/jobs/${entry.externalJobId}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {entry.externalJobId}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize">{entry.triggerType}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{entry.templateId ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{entry.recipientEmail ?? "—"}</td>
                        <td className="px-4 py-3"><OutcomeBadge outcome={entry.outcome} /></td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{entry.operatorId ?? "auto"}</td>
                      </tr>
                      {expandedId === entry.id && (
                        <tr key={`${entry.id}-expanded`} className="bg-muted/20">
                          <td colSpan={7} className="px-6 py-4">
                            {entry.renderedSubject && (
                              <p className="text-sm font-semibold mb-2">{entry.renderedSubject}</p>
                            )}
                            {entry.renderedBody && (
                              <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground bg-background border rounded p-3 max-h-48 overflow-y-auto">
                                {entry.renderedBody}
                              </pre>
                            )}
                            {entry.errorMessage && (
                              <p className="text-xs text-red-600 mt-2">Error: {entry.errorMessage}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages} — {total} total</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </CommsLayout>
  );
}
