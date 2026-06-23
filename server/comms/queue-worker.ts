/**
 * Comms Queue Worker
 *
 * Processes due queue items: renders the correct template, sends the email,
 * writes the audit log, and resets the cooldown timer.
 */

import crypto from "crypto";
import { log } from "../index";
import {
  getDueQueueItems,
  lockQueueItem,
  markQueueItemSent,
  markQueueItemFailed,
  markQueueItemSuppressed,
  getCommsSnapshot,
  getCommsState,
  updateCommsState,
  enqueueCommsJob,
  createCommsAuditEntry,
  seedTemplatesIfEmpty,
  getTemplate,
  isCommsManualMode,
} from "./comms-storage";
import { renderCommsForJob } from "./render-engine";
import type { CommsQueueItem } from "@shared/schema";

const DEFAULT_COOLDOWN_DAYS = Number(process.env.COMMS_DEFAULT_COOLDOWN_DAYS || "7");
const BATCH_SIZE = Number(process.env.COMMS_WORKER_BATCH_SIZE || "20");
const COMMS_DEMO_MODE = process.env.COMMS_DEMO_MODE === "true";
const COMMS_DEMO_RECIPIENT = process.env.COMMS_DEMO_RECIPIENT || "";

let workerIntervalHandle: ReturnType<typeof setInterval> | null = null;

// ── Email sender ───────────────────────────────────────────────────────────

async function sendCommsEmail(input: {
  to: string;
  name: string;
  subject: string;
  body: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");
  if (!from) throw new Error("RESEND_FROM or EMAIL_FROM not set");

  const recipient = COMMS_DEMO_MODE && COMMS_DEMO_RECIPIENT ? COMMS_DEMO_RECIPIENT : input.to;
  const subject = COMMS_DEMO_MODE ? `[DEMO] ${input.subject}` : input.subject;
  const htmlBody = input.body
    .split("\n")
    .map((line) =>
      line.trim() === ""
        ? "<br/>"
        : `<p style="margin:0 0 12px 0;">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
    )
    .join("");

  const payload: Record<string, unknown> = {
    from,
    to: [recipient],
    subject,
    text: input.body,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:600px;">${htmlBody}</div>`,
  };
  if (process.env.RESEND_REPLY_TO) payload.reply_to = process.env.RESEND_REPLY_TO;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
}

// ── Worker ─────────────────────────────────────────────────────────────────

async function processQueueItem(item: CommsQueueItem, workerId: string): Promise<void> {
  // Claim the item with a lease
  const claimed = await lockQueueItem(item.id, workerId);
  if (!claimed) {
    // Another worker already claimed it — skip
    return;
  }

  const snapshot = await getCommsSnapshot(item.externalJobId);
  const state = await getCommsState(item.externalJobId);

  if (!snapshot || !state) {
    await markQueueItemFailed(item.id, "snapshot or state not found");
    return;
  }

  // Skip if suppressed/paused/completed
  if (state.commsStatus !== "active") {
    await markQueueItemSuppressed(item.id);
    await createCommsAuditEntry({
      externalJobId: item.externalJobId,
      queueItemId: item.id,
      triggerType: item.triggerType === "manual" ? "manual" : "auto",
      templateId: null,
      renderedSubject: null,
      renderedBody: null,
      recipientEmail: null,
      recipientName: null,
      outcome: "suppressed",
      errorMessage: `commsStatus=${state.commsStatus}`,
      operatorId: item.triggeredBy ?? null,
      queuedAt: item.createdAt,
      sentAt: null,
      completedAt: new Date(),
      metadata: null,
    });
    return;
  }

  // Determine recipient email — use account email if available
  const recipientEmail = snapshot.accountCode
    ? (await getRecipientEmail(snapshot.accountCode))
    : null;

  if (!recipientEmail) {
    await markQueueItemFailed(item.id, "no recipient email found for account");
    await createCommsAuditEntry({
      externalJobId: item.externalJobId,
      queueItemId: item.id,
      triggerType: item.triggerType === "manual" ? "manual" : "auto",
      templateId: null,
      renderedSubject: null,
      renderedBody: null,
      recipientEmail: null,
      recipientName: null,
      outcome: "failed",
      errorMessage: "no recipient email found",
      operatorId: item.triggeredBy ?? null,
      queuedAt: item.createdAt,
      sentAt: null,
      completedAt: new Date(),
      metadata: null,
    });
    return;
  }

  // Render template
  const rendered = await renderCommsForJob(snapshot, state);
  if (!rendered) {
    await markQueueItemFailed(item.id, "no matching template found");
    await createCommsAuditEntry({
      externalJobId: item.externalJobId,
      queueItemId: item.id,
      triggerType: item.triggerType === "manual" ? "manual" : "auto",
      templateId: null,
      renderedSubject: null,
      renderedBody: null,
      recipientEmail,
      recipientName: snapshot.clientName ?? null,
      outcome: "skipped",
      errorMessage: "no template matched",
      operatorId: item.triggeredBy ?? null,
      queuedAt: item.createdAt,
      sentAt: null,
      completedAt: new Date(),
      metadata: null,
    });
    return;
  }

  const sentAt = new Date();
  try {
    await sendCommsEmail({
      to: recipientEmail,
      name: snapshot.clientName ?? recipientEmail,
      subject: rendered.subject,
      body: rendered.body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markQueueItemFailed(item.id, msg);
    await createCommsAuditEntry({
      externalJobId: item.externalJobId,
      queueItemId: item.id,
      triggerType: item.triggerType === "manual" ? "manual" : "auto",
      templateId: rendered.template.id,
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      recipientEmail,
      recipientName: snapshot.clientName ?? null,
      outcome: "failed",
      errorMessage: msg,
      operatorId: item.triggeredBy ?? null,
      queuedAt: item.createdAt,
      sentAt: null,
      completedAt: new Date(),
      metadata: JSON.stringify({ routeKey: rendered.routeKey }),
    });
    return;
  }

  // Mark sent
  await markQueueItemSent(item.id);
  await createCommsAuditEntry({
    externalJobId: item.externalJobId,
    queueItemId: item.id,
    triggerType: item.triggerType === "manual" ? "manual" : "auto",
    templateId: rendered.template.id,
    renderedSubject: rendered.subject,
    renderedBody: rendered.body,
    recipientEmail,
    recipientName: snapshot.clientName ?? null,
    outcome: "sent",
    errorMessage: null,
    operatorId: item.triggeredBy ?? null,
    queuedAt: item.createdAt,
    sentAt,
    completedAt: new Date(),
    metadata: JSON.stringify({ routeKey: rendered.routeKey, demoMode: COMMS_DEMO_MODE }),
  });

  // Reset cooldown timer
  const cooldownDays =
    state.cooldownDaysOverride ??
    rendered.template.defaultCooldownDays ??
    DEFAULT_COOLDOWN_DAYS;
  const nextDue = new Date(sentAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000);

  await updateCommsState(item.externalJobId, {
    lastCommsSentAt: sentAt,
    nextCommsDueAt: nextDue,
  });

  // Enqueue the next scheduled contact
  await enqueueCommsJob(item.externalJobId, {
    triggerType: "scheduled",
    dueAt: nextDue,
  });
}

async function getRecipientEmail(accountCode: string): Promise<string | null> {
  try {
    const { db } = await import("../db");
    const { customerAccounts } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const [account] = await db
      .select({ email: customerAccounts.email })
      .from(customerAccounts)
      .where(eq(customerAccounts.accountCode, accountCode));
    return account?.email ?? null;
  } catch {
    return null;
  }
}

async function releaseStaleLeases(): Promise<void> {
  const { db } = await import("../db");
  const { commsQueue } = await import("@shared/schema");
  const { eq, and, lt, isNotNull } = await import("drizzle-orm");
  await db
    .update(commsQueue)
    .set({ state: "due", lockedAt: null, lockedBy: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(commsQueue.state, "processing"),
        isNotNull(commsQueue.leaseExpiresAt),
        lt(commsQueue.leaseExpiresAt, new Date()),
      )!,
    );
}

export async function runCommsWorkerBatch(): Promise<{ batchId: string; processed: number; sent: number; failed: number; suppressed: number; skippedManualMode: number }> {
  const batchId = crypto.randomUUID();
  const workerId = `worker-${batchId}`;
  const items = await getDueQueueItems(BATCH_SIZE);
  const manualMode = await isCommsManualMode();

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let skippedManualMode = 0;

  for (const item of items) {
    // In manual mode, only process items that were explicitly triggered by an operator
    if (manualMode && item.triggerType !== "manual") {
      skippedManualMode++;
      log(`Manual mode — skipping auto item ${item.id} (${item.externalJobId})`, "comms-worker");
      continue;
    }

    try {
      await processQueueItem(item, workerId);
      const updated = await (async () => {
        const { db } = await import("../db");
        const { commsQueue } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [q] = await db.select().from(commsQueue).where(eq(commsQueue.id, item.id));
        return q;
      })();
      if (updated?.state === "sent") sent++;
      else if (updated?.state === "failed") failed++;
      else if (updated?.state === "suppressed") suppressed++;
    } catch (err) {
      failed++;
      log(
        `Queue worker error for item ${item.id}: ${err instanceof Error ? err.message : String(err)}`,
        "comms-worker",
      );
    }
  }

  log(
    `Comms worker batch ${batchId} — ${items.length} items: ${sent} sent, ${failed} failed, ${suppressed} suppressed${manualMode ? `, ${skippedManualMode} skipped (manual mode)` : ""}`,
    "comms-worker",
  );

  return { batchId, processed: items.length, sent, failed, suppressed, skippedManualMode };
}

export function startCommsQueueWorker(): void {
  const intervalMs = Math.max(
    Number.parseInt(process.env.COMMS_WORKER_INTERVAL_MS || "60000", 10) || 60000,
    15000,
  );

  // Seed templates on startup
  seedTemplatesIfEmpty().catch((err) =>
    log(`Template seed failed: ${err instanceof Error ? err.message : String(err)}`, "comms-worker"),
  );

  // Release stale leases on startup (handles crash recovery)
  releaseStaleLeases().catch((err) =>
    log(`Stale lease release failed: ${err instanceof Error ? err.message : String(err)}`, "comms-worker"),
  );

  workerIntervalHandle = setInterval(async () => {
    await releaseStaleLeases().catch(() => null);
    await runCommsWorkerBatch().catch((err) =>
      log(`Comms worker error: ${err instanceof Error ? err.message : String(err)}`, "comms-worker"),
    );
  }, intervalMs);

  log(`Comms queue worker started — interval ${intervalMs / 1000}s`, "comms-worker");
}
