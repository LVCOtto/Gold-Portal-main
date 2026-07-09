import { Router } from "express";
import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { registerCallbacksAuthRoutes } from "./auth-routes";
import { requireCallbacksAuth } from "./middleware";
import { customerAccounts, jobs, purchaseOrders } from "@shared/schema";

const router = Router();

registerCallbacksAuthRoutes(router);
router.use(requireCallbacksAuth);

function callbackCondition() {
  return ilike(jobs.jobType, "%callback%");
}

function workflowForJob(input: { status: string; dueDate: Date | null; visitDate: Date | null }) {
  const status = input.status.toLowerCase();
  const now = new Date();

  if (status.includes("complete") || status.includes("closed") || status.includes("cancelled")) return "completed";
  if (input.visitDate && input.visitDate < now) return "visit_date_lapsed";
  if (input.visitDate && input.visitDate >= now) return "booked";
  if (input.dueDate && input.dueDate < now) return "eta_expired";
  if (input.dueDate && input.dueDate <= new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)) return "eta_due_soon";
  if (status.includes("awaiting parts") || status.includes("parts")) return "awaiting_parts";
  return "ready_to_book";
}

async function listCallbackJobs(input: { search?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, input.page || 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize || 50));
  const offset = (page - 1) * pageSize;
  const conditions = [callbackCondition()];

  if (input.search) {
    const term = `%${input.search}%`;
    conditions.push(or(
      ilike(jobs.jobId, term),
      ilike(jobs.siteName, term),
      ilike(jobs.accountCode, term),
      ilike(jobs.engineerName, term),
      ilike(jobs.shortDescription, term),
    )!);
  }

  const where = and(...conditions);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(where);
  const rows = await db
    .select({
      id: jobs.id,
      jobId: jobs.jobId,
      accountCode: jobs.accountCode,
      clientName: customerAccounts.accountName,
      siteName: jobs.siteName,
      jobType: jobs.jobType,
      status: jobs.status,
      priority: jobs.priority,
      shortDescription: jobs.shortDescription,
      engineerName: jobs.engineerName,
      lastVisitDate: jobs.lastVisitDate,
      visitDate: jobs.visitDate,
      dueDate: jobs.dueDate,
      nextActionDueDate: jobs.nextActionDueDate,
      lastUpdatedDate: jobs.lastUpdatedDate,
    })
    .from(jobs)
    .leftJoin(customerAccounts, eq(jobs.accountCode, customerAccounts.accountCode))
    .where(where)
    .orderBy(desc(jobs.lastUpdatedDate))
    .limit(pageSize)
    .offset(offset);

  return {
    jobs: rows.map((job) => ({
      ...job,
      workflowStatus: workflowForJob({ status: job.status, dueDate: job.dueDate, visitDate: job.visitDate }),
      teamTakeoverEligible: !!job.visitDate && job.visitDate < new Date(),
    })),
    total: Number(count),
    page,
    pageSize,
  };
}

router.get("/jobs", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 50;
    res.json(await listCallbackJobs({ search, page, pageSize }));
  } catch (err) {
    next(err);
  }
});

router.get("/today", async (_req, res, next) => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const base = callbackCondition();

    const [etaExpired, etaDueSoon, visitDateLapsed, total] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(jobs).where(and(base, lt(jobs.dueDate, now))),
      db.select({ count: sql<number>`count(*)` }).from(jobs).where(and(base, sql`${jobs.dueDate} >= ${now}`, sql`${jobs.dueDate} <= ${soon}`)),
      db.select({ count: sql<number>`count(*)` }).from(jobs).where(and(base, lt(jobs.visitDate, now))),
      db.select({ count: sql<number>`count(*)` }).from(jobs).where(base),
    ]);

    const sample = await listCallbackJobs({ page: 1, pageSize: 12 });
    res.json({
      summary: {
        total: Number(total[0]?.count || 0),
        etaExpired: Number(etaExpired[0]?.count || 0),
        etaDueSoon: Number(etaDueSoon[0]?.count || 0),
        visitDateLapsed: Number(visitDateLapsed[0]?.count || 0),
        teamTakeoverRequired: Number(visitDateLapsed[0]?.count || 0),
      },
      priorityJobs: sample.jobs,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/jobs/:jobId", async (req, res, next) => {
  try {
    const data = await listCallbackJobs({ search: req.params.jobId, page: 1, pageSize: 10 });
    const job = data.jobs.find((item) => item.jobId === req.params.jobId);
    if (!job) return res.status(404).json({ message: "Callback job not found" });
    const pos = await db.select().from(purchaseOrders).where(eq(purchaseOrders.jobId, req.params.jobId));
    res.json({ job, purchaseOrders: pos });
  } catch (err) {
    next(err);
  }
});

export { router as callbacksRouter };