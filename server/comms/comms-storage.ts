import { db } from "../db";
import {
  commsJobSnapshots,
  commsJobStates,
  commsNotes,
  commsQueue,
  commsTemplates,
  commsTemplateVersions,
  commsAuditLog,
  systemSettings,
  type CommsJobSnapshot,
  type InsertCommsJobSnapshot,
  type CommsJobState,
  type InsertCommsJobState,
  type CommsNote,
  type InsertCommsNote,
  type CommsQueueItem,
  type InsertCommsQueueItem,
  type CommsTemplate,
  type CommsTemplateVersion,
  type InsertCommsTemplateVersion,
  type CommsAuditLogEntry,
  type InsertCommsAuditLogEntry,
} from "@shared/schema";
import { eq, and, or, ilike, desc, asc, lte, isNull, sql, inArray, lt } from "drizzle-orm";

const DEFAULT_COOLDOWN_DAYS = Number(process.env.COMMS_DEFAULT_COOLDOWN_DAYS || "7");

// ── Snapshots ──────────────────────────────────────────────────────────────

export async function upsertCommsSnapshot(snap: InsertCommsJobSnapshot): Promise<CommsJobSnapshot> {
  const [row] = await db
    .insert(commsJobSnapshots)
    .values({ ...snap, lastSyncedAt: new Date() })
    .onConflictDoUpdate({
      target: commsJobSnapshots.externalJobId,
      set: {
        accountCode: snap.accountCode,
        clientName: snap.clientName,
        siteName: snap.siteName,
        jobType: snap.jobType,
        status: snap.status,
        priority: snap.priority,
        shortDescription: snap.shortDescription,
        engineerName: snap.engineerName,
        lastVisitDate: snap.lastVisitDate,
        nextActionDueDate: snap.nextActionDueDate,
        createdDate: snap.createdDate,
        lastUpdatedDate: snap.lastUpdatedDate,
        rawImportMetadata: snap.rawImportMetadata,
        importBatchId: snap.importBatchId,
        lastSyncedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function getCommsSnapshot(externalJobId: string): Promise<CommsJobSnapshot | undefined> {
  const [row] = await db.select().from(commsJobSnapshots).where(eq(commsJobSnapshots.externalJobId, externalJobId));
  return row;
}

export async function listCommsSnapshots(filters: {
  search?: string;
  jobType?: string;
  jobTypePhrases?: string[];
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ snapshots: CommsJobSnapshot[]; total: number }> {
  const { search, jobType, jobTypePhrases, status, page = 1, pageSize = 50 } = filters;
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(commsJobSnapshots.externalJobId, `%${search}%`),
        ilike(commsJobSnapshots.clientName, `%${search}%`),
        ilike(commsJobSnapshots.siteName, `%${search}%`),
      )!,
    );
  }
  if (jobType) conditions.push(ilike(commsJobSnapshots.jobType, `%${jobType}%`));
  if (jobTypePhrases && jobTypePhrases.length > 0) {
    conditions.push(or(...jobTypePhrases.map((phrase) => ilike(commsJobSnapshots.jobType, `%${phrase}%`)))!);
  }
  if (status) conditions.push(ilike(commsJobSnapshots.status, `%${status}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(commsJobSnapshots).where(where);
  const rows = await db
    .select()
    .from(commsJobSnapshots)
    .where(where)
    .orderBy(desc(commsJobSnapshots.lastSyncedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { snapshots: rows, total: Number(count) };
}

// ── Job States ─────────────────────────────────────────────────────────────

export async function getOrCreateCommsState(externalJobId: string): Promise<CommsJobState> {
  const existing = await getCommsState(externalJobId);
  if (existing) return existing;
  const [row] = await db
    .insert(commsJobStates)
    .values({
      externalJobId,
      commsStatus: "active",
      nextCommsDueAt: new Date(), // due immediately for new jobs
    })
    .returning();
  return row;
}

export async function getCommsState(externalJobId: string): Promise<CommsJobState | undefined> {
  const [row] = await db.select().from(commsJobStates).where(eq(commsJobStates.externalJobId, externalJobId));
  return row;
}

export async function updateCommsState(
  externalJobId: string,
  patch: Partial<Omit<CommsJobState, "id" | "externalJobId" | "createdAt">>,
): Promise<CommsJobState> {
  const [row] = await db
    .update(commsJobStates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(commsJobStates.externalJobId, externalJobId))
    .returning();
  return row;
}

export async function suppressCommsJob(externalJobId: string, by: string, reason?: string): Promise<CommsJobState> {
  return updateCommsState(externalJobId, {
    commsStatus: "suppressed",
    suppressedAt: new Date(),
    suppressedBy: by,
    suppressionReason: reason ?? null,
    lastManualActionAt: new Date(),
    lastManualActionBy: by,
  });
}

export async function resumeCommsJob(externalJobId: string, by: string): Promise<CommsJobState> {
  return updateCommsState(externalJobId, {
    commsStatus: "active",
    suppressedAt: null,
    suppressedBy: null,
    suppressionReason: null,
    nextCommsDueAt: new Date(), // immediately eligible again
    lastManualActionAt: new Date(),
    lastManualActionBy: by,
  });
}

export async function listCommsStates(filters: {
  commsStatus?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ states: CommsJobState[]; total: number }> {
  const { commsStatus, page = 1, pageSize = 50 } = filters;
  const conditions = [];
  if (commsStatus && commsStatus !== "all") conditions.push(eq(commsJobStates.commsStatus, commsStatus));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(commsJobStates).where(where);
  const rows = await db
    .select()
    .from(commsJobStates)
    .where(where)
    .orderBy(asc(commsJobStates.nextCommsDueAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { states: rows, total: Number(count) };
}

// ── Notes ──────────────────────────────────────────────────────────────────

export async function addCommsNote(note: InsertCommsNote): Promise<CommsNote> {
  const [row] = await db.insert(commsNotes).values(note).returning();
  return row;
}

export async function getCommsNotes(externalJobId: string): Promise<CommsNote[]> {
  return db
    .select()
    .from(commsNotes)
    .where(eq(commsNotes.externalJobId, externalJobId))
    .orderBy(desc(commsNotes.createdAt));
}

// ── Queue ──────────────────────────────────────────────────────────────────

export async function enqueueCommsJob(
  externalJobId: string,
  opts: {
    dueAt?: Date;
    triggerType?: CommsQueueItem["triggerType"];
    triggeredBy?: string;
  } = {},
): Promise<CommsQueueItem> {
  const [row] = await db
    .insert(commsQueue)
    .values({
      externalJobId,
      state: "due",
      dueAt: opts.dueAt ?? new Date(),
      triggerType: opts.triggerType ?? "scheduled",
      triggeredBy: opts.triggeredBy ?? null,
    })
    .returning();
  return row;
}

export async function getDueQueueItems(limit = 20): Promise<CommsQueueItem[]> {
  const now = new Date();
  return db
    .select()
    .from(commsQueue)
    .where(
      and(
        eq(commsQueue.state, "due"),
        lte(commsQueue.dueAt, now),
        or(isNull(commsQueue.lockedAt), lt(commsQueue.leaseExpiresAt, now))!,
      )!,
    )
    .orderBy(asc(commsQueue.dueAt))
    .limit(limit);
}

export async function lockQueueItem(id: string, workerId: string): Promise<CommsQueueItem | undefined> {
  const leaseMinutes = Number(process.env.COMMS_WORKER_LEASE_MINUTES || "5");
  const leaseExpiry = new Date(Date.now() + leaseMinutes * 60 * 1000);
  const [row] = await db
    .update(commsQueue)
    .set({
      state: "processing",
      lockedAt: new Date(),
      lockedBy: workerId,
      leaseExpiresAt: leaseExpiry,
      updatedAt: new Date(),
    })
    .where(and(eq(commsQueue.id, id), eq(commsQueue.state, "due")))
    .returning();
  return row;
}

export async function markQueueItemSent(id: string): Promise<void> {
  await db
    .update(commsQueue)
    .set({ state: "sent", updatedAt: new Date() })
    .where(eq(commsQueue.id, id));
}

export async function markQueueItemFailed(id: string, error: string): Promise<void> {
  await db
    .update(commsQueue)
    .set({
      state: "failed",
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(commsQueue.id, id));
}

export async function markQueueItemSuppressed(id: string): Promise<void> {
  await db
    .update(commsQueue)
    .set({ state: "suppressed", updatedAt: new Date() })
    .where(eq(commsQueue.id, id));
}

export async function getQueueItemsByBatch(batchId: string): Promise<CommsQueueItem[]> {
  return db.select().from(commsQueue).where(eq(commsQueue.batchId, batchId)).orderBy(asc(commsQueue.createdAt));
}

export async function getQueueSummary(): Promise<Record<string, number>> {
  const rows = await db
    .select({ state: commsQueue.state, count: sql<number>`count(*)` })
    .from(commsQueue)
    .groupBy(commsQueue.state);
  return Object.fromEntries(rows.map((r) => [r.state, Number(r.count)]));
}

export async function getDueCount(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commsQueue)
    .where(and(eq(commsQueue.state, "due"), lte(commsQueue.dueAt, new Date()))!);
  return Number(count);
}

export async function retryFailedQueueItem(id: string): Promise<CommsQueueItem | undefined> {
  const [row] = await db
    .update(commsQueue)
    .set({
      state: "due",
      dueAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(commsQueue.id, id), eq(commsQueue.state, "failed")))
    .returning();
  return row;
}

// ── Templates ──────────────────────────────────────────────────────────────

export async function getAllTemplates(): Promise<CommsTemplate[]> {
  return db.select().from(commsTemplates).orderBy(asc(commsTemplates.sortOrder), asc(commsTemplates.id));
}

export async function getTemplate(id: string): Promise<CommsTemplate | undefined> {
  const [row] = await db.select().from(commsTemplates).where(eq(commsTemplates.id, id));
  return row;
}

export async function getTemplateByRouteKey(routeKey: string): Promise<CommsTemplate | undefined> {
  const [row] = await db
    .select()
    .from(commsTemplates)
    .where(and(eq(commsTemplates.routeKey, routeKey), eq(commsTemplates.enabled, true)));
  return row;
}

export async function upsertTemplate(template: CommsTemplate): Promise<CommsTemplate> {
  const [row] = await db
    .insert(commsTemplates)
    .values(template)
    .onConflictDoUpdate({
      target: commsTemplates.id,
      set: {
        displayName: template.displayName,
        routeKey: template.routeKey,
        subject: template.subject,
        body: template.body,
        tone: template.tone,
        operatorNotes: template.operatorNotes,
        defaultCooldownDays: template.defaultCooldownDays,
        enabled: template.enabled,
        sortOrder: template.sortOrder,
        updatedBy: template.updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Omit<CommsTemplate, "id" | "createdAt">>,
  updatedBy: string,
): Promise<CommsTemplate | undefined> {
  // Version the old template first
  const old = await getTemplate(id);
  if (old) {
    await db.insert(commsTemplateVersions).values({
      templateId: id,
      snapshot: JSON.stringify(old),
      changedBy: updatedBy,
    });
  }
  const [row] = await db
    .update(commsTemplates)
    .set({ ...patch, updatedBy, updatedAt: new Date() })
    .where(eq(commsTemplates.id, id))
    .returning();
  return row;
}

export async function getTemplateVersions(templateId: string): Promise<CommsTemplateVersion[]> {
  return db
    .select()
    .from(commsTemplateVersions)
    .where(eq(commsTemplateVersions.templateId, templateId))
    .orderBy(desc(commsTemplateVersions.changedAt));
}

// ── Audit Log ──────────────────────────────────────────────────────────────

export async function createCommsAuditEntry(entry: InsertCommsAuditLogEntry): Promise<CommsAuditLogEntry> {
  const [row] = await db.insert(commsAuditLog).values(entry).returning();
  return row;
}

export async function getCommsAuditForJob(externalJobId: string): Promise<CommsAuditLogEntry[]> {
  return db
    .select()
    .from(commsAuditLog)
    .where(eq(commsAuditLog.externalJobId, externalJobId))
    .orderBy(desc(commsAuditLog.createdAt));
}

export async function listCommsAudit(filters: {
  externalJobId?: string;
  outcome?: string;
  triggerType?: string;
  operatorId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ entries: CommsAuditLogEntry[]; total: number }> {
  const { externalJobId, outcome, triggerType, operatorId, page = 1, pageSize = 50 } = filters;
  const conditions = [];
  if (externalJobId) conditions.push(ilike(commsAuditLog.externalJobId, `%${externalJobId}%`));
  if (outcome) conditions.push(eq(commsAuditLog.outcome, outcome));
  if (triggerType) conditions.push(eq(commsAuditLog.triggerType, triggerType));
  if (operatorId) conditions.push(eq(commsAuditLog.operatorId, operatorId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(commsAuditLog).where(where);
  const rows = await db
    .select()
    .from(commsAuditLog)
    .where(where)
    .orderBy(desc(commsAuditLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { entries: rows, total: Number(count) };
}

// ── Manual Mode ────────────────────────────────────────────────────────────

const COMMS_MANUAL_MODE_KEY = "comms_manual_mode";
const COMMS_JOB_TYPE_ALLOWLIST_KEY = "comms_job_type_allowlist";

export async function isCommsManualMode(): Promise<boolean> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, COMMS_MANUAL_MODE_KEY));
  // Safe startup default: manual mode stays ON until an operator explicitly disables it.
  if (!row) return true;
  return row.value === "true";
}

export async function setCommsManualMode(enabled: boolean): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key: COMMS_MANUAL_MODE_KEY, value: enabled ? "true" : "false", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: enabled ? "true" : "false", updatedAt: new Date() },
    });
}

/** Returns the job-type allowlist phrases. Empty array = all job types allowed. */
export async function getCommsJobTypeAllowlist(): Promise<string[]> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, COMMS_JOB_TYPE_ALLOWLIST_KEY));
  if (!row || !row.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export async function setCommsJobTypeAllowlist(phrases: string[]): Promise<void> {
  const value = JSON.stringify(phrases.map((p) => p.trim()).filter(Boolean));
  await db
    .insert(systemSettings)
    .values({ key: COMMS_JOB_TYPE_ALLOWLIST_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/** Check if a job type matches the allowlist. Returns true if allowed. */
export function jobTypeMatchesAllowlist(jobType: string | null | undefined, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // empty = all allowed
  if (!jobType) return false;
  const lc = jobType.toLowerCase();
  return allowlist.some((phrase) => lc.includes(phrase.toLowerCase()));
}

// ── Seed Templates ─────────────────────────────────────────────────────────

export const SEED_TEMPLATES: CommsTemplate[] = [
  {
    id: "newly_pending",
    displayName: "Newly Pending",
    routeKey: "newly_pending",
    subject: "Job {{jobId}} — received and logged",
    body: `Dear {{clientName}},\n\nThank you for getting in touch. We have received your job request and it is now logged on our system.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\nDescription: {{shortDescription}}\n\nWe will be in touch shortly with next steps. If you have any questions in the meantime, please reply to this email.\n\nKind regards,\nThe LVC Service Team`,
    tone: "friendly",
    operatorNotes: "Sent when a new job first enters the comms queue.",
    defaultCooldownDays: 7,
    enabled: true,
    sortOrder: 1,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "in_progress_update",
    displayName: "In Progress Update",
    routeKey: "in_progress",
    subject: "Update on job {{jobId}}",
    body: `Dear {{clientName}},\n\nWe wanted to provide you with an update on your job.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\nCurrent status: {{status}}\n\nOur team is currently working on this and we will keep you informed of any developments. If you need to discuss anything, please don't hesitate to get in touch.\n\nKind regards,\nThe LVC Service Team`,
    tone: "friendly",
    operatorNotes: "General in-progress update.",
    defaultCooldownDays: 7,
    enabled: true,
    sortOrder: 2,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "waiting_on_supplier",
    displayName: "Awaiting Parts / Supplier",
    routeKey: "waiting_on_supplier",
    subject: "Parts update for job {{jobId}}",
    body: `Dear {{clientName}},\n\nWe are currently awaiting parts for your job and wanted to keep you informed.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\nStatus: {{status}}\n\nAs soon as the parts arrive we will proceed promptly. We appreciate your patience and will update you again once parts are received.\n\nKind regards,\nThe LVC Service Team`,
    tone: "friendly",
    operatorNotes: "Used when job is in Awaiting Parts status.",
    defaultCooldownDays: 7,
    enabled: true,
    sortOrder: 3,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "waiting_on_client",
    displayName: "Awaiting Client Action",
    routeKey: "waiting_on_client",
    subject: "Action required — job {{jobId}}",
    body: `Dear {{clientName}},\n\nWe are awaiting your response or approval in order to progress job {{jobId}}.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\nStatus: {{status}}\n\nPlease let us know how you would like to proceed at your earliest convenience so we can keep this job moving forward.\n\nKind regards,\nThe LVC Service Team`,
    tone: "formal",
    operatorNotes: "Used when waiting for client approval or input.",
    defaultCooldownDays: 5,
    enabled: true,
    sortOrder: 4,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "delayed",
    displayName: "Delayed / On Hold",
    routeKey: "delayed",
    subject: "Job {{jobId}} — update on delay",
    body: `Dear {{clientName}},\n\nWe wanted to let you know that job {{jobId}} has been temporarily delayed. We apologise for any inconvenience this may cause.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\nCurrent status: {{status}}\n\nWe are working to resolve this as quickly as possible and will be in touch as soon as there is further progress.\n\nKind regards,\nThe LVC Service Team`,
    tone: "formal",
    operatorNotes: "Used when job is on hold or delayed.",
    defaultCooldownDays: 7,
    enabled: true,
    sortOrder: 5,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "completed_followup",
    displayName: "Completed — Follow Up",
    routeKey: "completed_followup",
    subject: "Job {{jobId}} — completed",
    body: `Dear {{clientName}},\n\nWe are pleased to let you know that job {{jobId}} has been completed.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\n\nThank you for choosing LVC. If you have any questions or require any further assistance, please do not hesitate to get in touch.\n\nKind regards,\nThe LVC Service Team`,
    tone: "friendly",
    operatorNotes: "Sent when a job reaches completed status.",
    defaultCooldownDays: 14,
    enabled: true,
    sortOrder: 6,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "escalated",
    displayName: "Escalated",
    routeKey: "escalated",
    subject: "Urgent update — job {{jobId}}",
    body: `Dear {{clientName}},\n\nThis job has been escalated and a senior member of our team is now personally overseeing its progress.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\nStatus: {{status}}\n\nWe take this matter seriously and will be in direct contact with you shortly.\n\nKind regards,\nThe LVC Service Team`,
    tone: "urgent",
    operatorNotes: "Reserved for escalated or priority jobs.",
    defaultCooldownDays: 3,
    enabled: true,
    sortOrder: 7,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
  {
    id: "no_recent_change",
    displayName: "No Recent Change — Proactive Update",
    routeKey: "no_recent_change",
    subject: "Checking in on job {{jobId}}",
    body: `Dear {{clientName}},\n\nWe wanted to check in and let you know that job {{jobId}} is still active on our system. While there has been no major change to report at this time, please be assured that your job remains a priority for our team.\n\nJob reference: {{jobId}}\nSite: {{siteName}}\nStatus: {{status}}\n\nWe will be in touch as soon as there are any updates. If you have any questions in the meantime, please reply to this email.\n\nKind regards,\nThe LVC Service Team`,
    tone: "friendly",
    operatorNotes: "Fallback template — used when no other route key matches.",
    defaultCooldownDays: 7,
    enabled: true,
    sortOrder: 8,
    updatedBy: "system",
    updatedAt: new Date(),
    createdAt: new Date(),
  },
];

export async function seedTemplatesIfEmpty(): Promise<void> {
  const existing = await getAllTemplates();
  if (existing.length > 0) return;
  for (const t of SEED_TEMPLATES) {
    await upsertTemplate(t);
  }
}
