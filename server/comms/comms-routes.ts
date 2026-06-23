import { Router } from "express";
import { z } from "zod";
import { requireCommsAuth } from "./middleware";
import { registerCommsAuthRoutes } from "./auth-routes";
import { runCommsImport } from "./import-worker";
import { runCommsWorkerBatch, runCommsWorkerForJob } from "./queue-worker";
import {
  listCommsSnapshots,
  getCommsSnapshot,
  getCommsState,
  getOrCreateCommsState,
  updateCommsState,
  suppressCommsJob,
  resumeCommsJob,
  addCommsNote,
  getCommsNotes,
  enqueueCommsJob,
  getDueQueueItems,
  getQueueSummary,
  getDueCount,
  getQueueItemsByBatch,
  retryFailedQueueItem,
  getAllTemplates,
  getTemplate,
  getTemplateVersions,
  updateTemplate,
  upsertTemplate,
  getCommsAuditForJob,
  listCommsAudit,
  isCommsManualMode,
  setCommsManualMode,
  getCommsJobTypeAllowlist,
  setCommsJobTypeAllowlist,
} from "./comms-storage";
import { db } from "../db";
import { commsQueue, commsJobStates, commsJobSnapshots, commsAuditLog } from "@shared/schema";
import { eq, and, lte, gte, desc, sql, inArray } from "drizzle-orm";

const router = Router();

// ── Auth (unauthenticated) ─────────────────────────────────────────────────
registerCommsAuthRoutes(router);

// ── Apply auth guard to everything below ──────────────────────────────────
router.use(requireCommsAuth);

// ─────────────────────────────────────────────────────────────────────────
// JOBS
// ─────────────────────────────────────────────────────────────────────────

// GET /api/comms/jobs — paginated, filterable job board
router.get("/jobs", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const jobType = typeof req.query.jobType === "string" ? req.query.jobType : undefined;
    const jobTypeContains = typeof req.query.jobTypeContains === "string" ? req.query.jobTypeContains : undefined;
    const jobTypePhrases = jobTypeContains
      ? jobTypeContains
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20)
      : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const commsStatus = typeof req.query.commsStatus === "string" ? req.query.commsStatus : undefined;

    const { snapshots, total } = await listCommsSnapshots({ search, jobType, jobTypePhrases, status, page, pageSize });

    // Batch-fetch states to avoid N+1
    const jobIds = snapshots.map((s) => s.externalJobId);
    let stateMap: Record<string, (typeof commsJobStates.$inferSelect)> = {};
    const latestAuditMap: Record<
      string,
      {
        outcome: string;
        triggerType: string;
        sentAt: Date | null;
        completedAt: Date | null;
        errorMessage: string | null;
      }
    > = {};

    if (jobIds.length > 0) {
      const states = await db.select().from(commsJobStates).where(inArray(commsJobStates.externalJobId, jobIds));
      stateMap = Object.fromEntries(states.map((s) => [s.externalJobId, s]));

      const auditRows = await db
        .select({
          externalJobId: commsAuditLog.externalJobId,
          outcome: commsAuditLog.outcome,
          triggerType: commsAuditLog.triggerType,
          sentAt: commsAuditLog.sentAt,
          completedAt: commsAuditLog.completedAt,
          errorMessage: commsAuditLog.errorMessage,
          createdAt: commsAuditLog.createdAt,
        })
        .from(commsAuditLog)
        .where(inArray(commsAuditLog.externalJobId, jobIds))
        .orderBy(desc(commsAuditLog.createdAt));

      for (const row of auditRows) {
        if (!latestAuditMap[row.externalJobId]) {
          latestAuditMap[row.externalJobId] = {
            outcome: row.outcome,
            triggerType: row.triggerType,
            sentAt: row.sentAt,
            completedAt: row.completedAt,
            errorMessage: row.errorMessage,
          };
        }
      }
    }

    const enriched = snapshots.map((snap) => ({
      ...snap,
      state: stateMap[snap.externalJobId] ?? null,
      lastAction: latestAuditMap[snap.externalJobId] ?? null,
    }));

    // Filter by commsStatus if requested
    const filtered =
      commsStatus && commsStatus !== "all"
        ? enriched.filter((j) => j.state?.commsStatus === commsStatus)
        : enriched;

    return res.json({
      jobs: filtered,
      total: commsStatus && commsStatus !== "all" ? filtered.length : total,
      page,
      pageSize,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/jobs/:jobId
router.get("/jobs/:jobId", async (req, res, next) => {
  try {
    const snapshot = await getCommsSnapshot(req.params.jobId);
    if (!snapshot) return res.status(404).json({ error: "Job not found" });
    const state = await getOrCreateCommsState(req.params.jobId);
    const notes = await getCommsNotes(req.params.jobId);
    return res.json({ snapshot, state, notes });
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/jobs/:jobId/state
router.get("/jobs/:jobId/state", async (req, res, next) => {
  try {
    const state = await getCommsState(req.params.jobId);
    if (!state) return res.status(404).json({ error: "State not found" });
    return res.json(state);
  } catch (err) {
    next(err);
  }
});

const patchStateSchema = z.object({
  assignedOperator: z.string().optional(),
  templateOverrideKey: z.string().nullable().optional(),
  escalationFlag: z.boolean().optional(),
  cooldownDaysOverride: z.number().int().min(1).max(365).nullable().optional(),
  internalTags: z.array(z.string()).optional(),
});

// PATCH /api/comms/jobs/:jobId/state
router.patch("/jobs/:jobId/state", async (req, res, next) => {
  try {
    const parsed = patchStateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const operator = req.session.commsOperator!.email;
    const patch: Record<string, unknown> = { ...parsed.data, lastManualActionAt: new Date(), lastManualActionBy: operator };

    if (patch.internalTags !== undefined) {
      patch.internalTags = JSON.stringify(patch.internalTags);
    }

    const state = await getCommsState(req.params.jobId);
    if (!state) return res.status(404).json({ error: "State not found" });

    const updated = await updateCommsState(req.params.jobId, patch as any);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/jobs/:jobId/comms — audit history for job
router.get("/jobs/:jobId/comms", async (req, res, next) => {
  try {
    const entries = await getCommsAuditForJob(req.params.jobId);
    return res.json(entries);
  } catch (err) {
    next(err);
  }
});

// POST /api/comms/jobs/:jobId/trigger-update — manual send
router.post("/jobs/:jobId/trigger-update", async (req, res, next) => {
  try {
    const snapshot = await getCommsSnapshot(req.params.jobId);
    if (!snapshot) return res.status(404).json({ error: "Job not found" });

    const operator = req.session.commsOperator!.email;
    const runNow = req.query.runNow !== "0";
    await getOrCreateCommsState(req.params.jobId);

    // Prevent duplicate pending MANUAL queue items for the same job.
    // If only scheduled due items exist, we still enqueue a manual one.
    const existingDue = await db
      .select({ id: commsQueue.id, triggerType: commsQueue.triggerType })
      .from(commsQueue)
      .where(and(eq(commsQueue.externalJobId, req.params.jobId), eq(commsQueue.state, "due")))
      .limit(20);

    const existingManualDue = existingDue.find((q) => q.triggerType === "manual");

    if (existingManualDue) {
      const worker = runNow
        ? await runCommsWorkerForJob(req.params.jobId, { manualOnly: true })
        : null;
      return res.json({ queued: true, queueItemId: existingManualDue.id, note: "already queued", worker });
    }

    const queueItem = await enqueueCommsJob(req.params.jobId, {
      triggerType: "manual",
      triggeredBy: operator,
      dueAt: new Date(),
    });

    await updateCommsState(req.params.jobId, {
      lastManualActionAt: new Date(),
      lastManualActionBy: operator,
    });

    const worker = runNow
      ? await runCommsWorkerForJob(req.params.jobId, { manualOnly: true })
      : null;

    return res.json({ queued: true, queueItemId: queueItem.id, worker });
  } catch (err) {
    next(err);
  }
});

const suppressSchema = z.object({ reason: z.string().max(500).optional() });

// POST /api/comms/jobs/:jobId/suppress
router.post("/jobs/:jobId/suppress", async (req, res, next) => {
  try {
    const parsed = suppressSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const operator = req.session.commsOperator!.email;
    const state = await suppressCommsJob(req.params.jobId, operator, parsed.data.reason);
    return res.json(state);
  } catch (err) {
    next(err);
  }
});

// POST /api/comms/jobs/:jobId/resume
router.post("/jobs/:jobId/resume", async (req, res, next) => {
  try {
    const operator = req.session.commsOperator!.email;
    const state = await resumeCommsJob(req.params.jobId, operator);
    return res.json(state);
  } catch (err) {
    next(err);
  }
});

const noteSchema = z.object({ note: z.string().min(1).max(2000) });

// POST /api/comms/jobs/:jobId/note
router.post("/jobs/:jobId/note", async (req, res, next) => {
  try {
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const operator = req.session.commsOperator!.email;
    const note = await addCommsNote({
      externalJobId: req.params.jobId,
      note: parsed.data.note,
      createdBy: operator,
    });
    return res.json(note);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// QUEUE
// ─────────────────────────────────────────────────────────────────────────

// GET /api/comms/queue/due
router.get("/queue/due", async (_req, res, next) => {
  try {
    const items = await getDueQueueItems(50);
    const dueCount = await getDueCount();
    return res.json({ items, dueCount });
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/queue/summary
router.get("/queue/summary", async (_req, res, next) => {
  try {
    const summary = await getQueueSummary();
    return res.json(summary);
  } catch (err) {
    next(err);
  }
});

// POST /api/comms/queue/run — manually trigger worker
router.post("/queue/run", async (req, res, next) => {
  try {
    // Optional cron secret check for external callers
    const cronSecret = process.env.COMMS_CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${cronSecret}`) {
        if (!req.session.commsOperator) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      }
    }

    const result = await runCommsWorkerBatch();
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/queue/status/:batchId
router.get("/queue/status/:batchId", async (req, res, next) => {
  try {
    const items = await getQueueItemsByBatch(req.params.batchId);
    const summary = { total: items.length, sent: 0, failed: 0, suppressed: 0, processing: 0 };
    for (const item of items) {
      if (item.state === "sent") summary.sent++;
      else if (item.state === "failed") summary.failed++;
      else if (item.state === "suppressed") summary.suppressed++;
      else if (item.state === "processing") summary.processing++;
    }
    return res.json({ batchId: req.params.batchId, items, summary });
  } catch (err) {
    next(err);
  }
});

// POST /api/comms/queue/retry/:itemId
router.post("/queue/retry/:itemId", async (req, res, next) => {
  try {
    const item = await retryFailedQueueItem(req.params.itemId);
    if (!item) return res.status(404).json({ error: "Queue item not found or not in failed state" });
    return res.json(item);
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/queue/recent — recently sent items
router.get("/queue/recent", async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const items = await db
      .select()
      .from(commsQueue)
      .where(and(eq(commsQueue.state, "sent"), gte(commsQueue.updatedAt, since))!)
      .orderBy(desc(commsQueue.updatedAt))
      .limit(50);
    return res.json(items);
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/queue/failed
router.get("/queue/failed", async (_req, res, next) => {
  try {
    const items = await db
      .select()
      .from(commsQueue)
      .where(eq(commsQueue.state, "failed"))
      .orderBy(desc(commsQueue.updatedAt))
      .limit(100);
    return res.json(items);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────

// GET /api/comms/templates
router.get("/templates", async (_req, res, next) => {
  try {
    const templates = await getAllTemplates();
    return res.json(templates);
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/templates/:templateId
router.get("/templates/:templateId", async (req, res, next) => {
  try {
    const template = await getTemplate(req.params.templateId);
    if (!template) return res.status(404).json({ error: "Template not found" });
    const versions = await getTemplateVersions(req.params.templateId);
    return res.json({ template, versions });
  } catch (err) {
    next(err);
  }
});

const patchTemplateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  routeKey: z.string().min(1).max(50).optional(),
  subject: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(10000).optional(),
  tone: z.enum(["formal", "friendly", "urgent"]).nullable().optional(),
  operatorNotes: z.string().max(1000).nullable().optional(),
  defaultCooldownDays: z.number().int().min(1).max(365).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// PATCH /api/comms/templates/:templateId
router.patch("/templates/:templateId", async (req, res, next) => {
  try {
    const parsed = patchTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const operator = req.session.commsOperator!.email;
    const existing = await getTemplate(req.params.templateId);
    if (!existing) return res.status(404).json({ error: "Template not found" });

    const updated = await updateTemplate(req.params.templateId, parsed.data, operator);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

const createTemplateSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "ID must be lowercase alphanumeric with underscores"),
  displayName: z.string().min(1).max(100),
  routeKey: z.string().min(1).max(50),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10000),
  tone: z.enum(["formal", "friendly", "urgent"]).optional(),
  operatorNotes: z.string().max(1000).optional(),
  defaultCooldownDays: z.number().int().min(1).max(365).default(7),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// POST /api/comms/templates
router.post("/templates", async (req, res, next) => {
  try {
    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const operator = req.session.commsOperator!.email;
    const existing = await getTemplate(parsed.data.id);
    if (existing) return res.status(409).json({ error: "Template ID already exists" });

    const template = await upsertTemplate({
      ...parsed.data,
      tone: parsed.data.tone ?? null,
      operatorNotes: parsed.data.operatorNotes ?? null,
      updatedBy: operator,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    return res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────────────────────────────────

// POST /api/comms/import/run
router.post("/import/run", async (req, res, next) => {
  try {
    const operator = req.session.commsOperator!.email;
    const result = await runCommsImport(operator);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/import/status
router.get("/import/status", async (_req, res, next) => {
  try {
    const [latestSnapshot] = await db
      .select({ lastSyncedAt: commsJobSnapshots.lastSyncedAt })
      .from(commsJobSnapshots)
      .orderBy(desc(commsJobSnapshots.lastSyncedAt))
      .limit(1);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(commsJobSnapshots);

    const [{ activeCount }] = await db
      .select({ activeCount: sql<number>`count(*)` })
      .from(commsJobStates)
      .where(eq(commsJobStates.commsStatus, "active"));

    return res.json({
      lastSyncedAt: latestSnapshot?.lastSyncedAt ?? null,
      totalSnapshots: Number(count),
      activeJobs: Number(activeCount),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────

// GET /api/comms/audit
router.get("/audit", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const externalJobId = typeof req.query.jobId === "string" ? req.query.jobId : undefined;
    const outcome = typeof req.query.outcome === "string" ? req.query.outcome : undefined;
    const triggerType = typeof req.query.triggerType === "string" ? req.query.triggerType : undefined;
    const operatorId = typeof req.query.operatorId === "string" ? req.query.operatorId : undefined;

    const { entries, total } = await listCommsAudit({ externalJobId, outcome, triggerType, operatorId, page, pageSize });
    return res.json({ entries, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────

// GET /api/comms/settings
router.get("/settings", async (_req, res, next) => {
  try {
    const manualMode = await isCommsManualMode();
    return res.json({ manualMode });
  } catch (err) {
    next(err);
  }
});

// POST /api/comms/settings/manual-mode
router.post("/settings/manual-mode", async (req, res, next) => {
  try {
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled (boolean) is required" });
    }
    await setCommsManualMode(enabled);
    return res.json({ manualMode: enabled });
  } catch (err) {
    next(err);
  }
});

// GET /api/comms/settings/job-type-allowlist
router.get("/settings/job-type-allowlist", async (_req, res, next) => {
  try {
    const allowlist = await getCommsJobTypeAllowlist();
    return res.json({ allowlist });
  } catch (err) {
    next(err);
  }
});

// POST /api/comms/settings/job-type-allowlist
const allowlistSchema = z.object({
  allowlist: z.array(z.string().min(1).max(100)).max(50),
});
router.post("/settings/job-type-allowlist", async (req, res, next) => {
  try {
    const parsed = allowlistSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    await setCommsJobTypeAllowlist(parsed.data.allowlist);
    return res.json({ allowlist: parsed.data.allowlist });
  } catch (err) {
    next(err);
  }
});

export { router as commsRouter };
