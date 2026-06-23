/**
 * Comms Render Engine
 *
 * Selects the appropriate template for a job context and renders it
 * by substituting {{token}} placeholders.
 */

import type { CommsJobSnapshot, CommsJobState, CommsTemplate } from "@shared/schema";
import { getAllTemplates, getTemplate } from "./comms-storage";

// ── Status → route key mapping ─────────────────────────────────────────────

const STATUS_ROUTE_MAP: Array<{ pattern: RegExp; routeKey: string }> = [
  { pattern: /complet/i, routeKey: "completed_followup" },
  { pattern: /closed|cancelled/i, routeKey: "completed_followup" },
  { pattern: /escalat/i, routeKey: "escalated" },
  { pattern: /await.*approval|pending.*approval|quote.*sent|approval/i, routeKey: "waiting_on_client" },
  { pattern: /await.*parts|parts.*ordered|parts.*on.*order/i, routeKey: "waiting_on_supplier" },
  { pattern: /await.*client|client.*action/i, routeKey: "waiting_on_client" },
  { pattern: /on.*hold|hold/i, routeKey: "delayed" },
  { pattern: /in.*progress|scheduled|engineer.*assigned|work.*in.*progress|approved.*processing/i, routeKey: "in_progress" },
  { pattern: /pending|new|logged|received/i, routeKey: "newly_pending" },
];

function resolveRouteKey(status: string | null): string {
  if (!status) return "no_recent_change";
  for (const { pattern, routeKey } of STATUS_ROUTE_MAP) {
    if (pattern.test(status)) return routeKey;
  }
  return "no_recent_change";
}

// ── Token substitution ─────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "N/A";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export interface CommsRenderContext {
  jobId: string;
  clientName: string;
  siteName: string;
  jobType: string;
  status: string;
  priority: string;
  shortDescription: string;
  engineerName: string;
  lastVisitDate: string;
  nextActionDueDate: string;
  commsStatus: string;
  lastCommsSentAt: string;
  nextCommsDueAt: string;
  escalationFlag: string;
  assignedOperator: string;
  today: string;
  portalUrl: string;
}

function buildContext(snapshot: CommsJobSnapshot, state: CommsJobState): CommsRenderContext {
  return {
    jobId: snapshot.externalJobId,
    clientName: snapshot.clientName ?? snapshot.accountCode ?? "Valued Customer",
    siteName: snapshot.siteName ?? "N/A",
    jobType: snapshot.jobType ?? "N/A",
    status: snapshot.status ?? "N/A",
    priority: snapshot.priority ?? "Standard",
    shortDescription: snapshot.shortDescription ?? "",
    engineerName: snapshot.engineerName ?? "our engineer",
    lastVisitDate: formatDate(snapshot.lastVisitDate),
    nextActionDueDate: formatDate(snapshot.nextActionDueDate),
    commsStatus: state.commsStatus,
    lastCommsSentAt: formatDate(state.lastCommsSentAt),
    nextCommsDueAt: formatDate(state.nextCommsDueAt),
    escalationFlag: state.escalationFlag ? "Yes" : "No",
    assignedOperator: state.assignedOperator ?? "the service team",
    today: formatDate(new Date()),
    portalUrl: (process.env.COMMS_PORTAL_BASE_URL || "").replace(/\/$/, ""),
  };
}

function renderTemplate(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? `{{${key}}}`);
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface RenderedComms {
  template: CommsTemplate;
  subject: string;
  body: string;
  routeKey: string;
}

export async function renderCommsForJob(
  snapshot: CommsJobSnapshot,
  state: CommsJobState,
): Promise<RenderedComms | null> {
  // Determine which template to use
  const overrideKey = state.templateOverrideKey;
  let template: CommsTemplate | undefined;

  if (overrideKey) {
    template = await getTemplate(overrideKey);
  }

  if (!template) {
    const routeKey = resolveRouteKey(snapshot.status);
    // Look for a matching enabled template
    const all = await getAllTemplates();
    template = all.find((t) => t.routeKey === routeKey && t.enabled);
    // Fall back to no_recent_change
    if (!template) {
      template = all.find((t) => t.routeKey === "no_recent_change" && t.enabled);
    }
  }

  if (!template) return null;

  const ctx = buildContext(snapshot, state) as unknown as Record<string, string>;
  const subject = renderTemplate(template.subject, ctx);
  const body = renderTemplate(template.body, ctx);

  return { template, subject, body, routeKey: template.routeKey };
}
