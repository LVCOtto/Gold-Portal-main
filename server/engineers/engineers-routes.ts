import { Router } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { registerEngineerAuthRoutes } from "./auth-routes";
import { requireEngineerAuth } from "./middleware";
import { db } from "../db";
import { customerAccounts, jobs, purchaseOrders } from "@shared/schema";

const router = Router();

registerEngineerAuthRoutes(router);
router.use(requireEngineerAuth);

function toNameFilters(names: string[]) {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((name) => sql`lower(trim(${jobs.engineerName})) = lower(trim(${name}))`);
}

type EngineerCategory = "all" | "today" | "upcoming" | "overdue" | "awaiting_parts" | "unplanned" | "completed";

function isCompletedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized.includes("complete") || normalized.includes("closed") || normalized.includes("cancelled");
}

function isAwaitingParts(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized.includes("parts") || normalized.includes("awaiting parts");
}

function dayStart(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function dayEnd(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function inDateRange(value: Date | null, from: Date, to: Date): boolean {
  if (!value) return false;
  return value >= from && value <= to;
}

function matchesCategory(job: { status: string; visitDate: Date | null; dueDate: Date | null }, category: EngineerCategory): boolean {
  if (category === "all") return true;

  const now = new Date();
  const todayStart = dayStart(now);
  const todayEnd = dayEnd(now);
  const weekEnd = dayEnd(addDays(todayStart, 7));

  const completed = isCompletedStatus(job.status);

  if (category === "completed") return completed;
  if (completed) return false;

  if (category === "today") {
    return inDateRange(job.visitDate, todayStart, todayEnd);
  }

  if (category === "upcoming") {
    return !!job.visitDate && job.visitDate > todayEnd && job.visitDate <= weekEnd;
  }

  if (category === "overdue") {
    return !!job.visitDate && job.visitDate < todayStart;
  }

  if (category === "awaiting_parts") {
    return isAwaitingParts(job.status) || (!!job.dueDate && job.dueDate < now);
  }

  if (category === "unplanned") {
    return !job.visitDate;
  }

  return true;
}

function computeSummary(items: Array<{ status: string; visitDate: Date | null; dueDate: Date | null }>) {
  const now = new Date();
  const todayStart = dayStart(now);
  const todayEnd = dayEnd(now);
  const weekEnd = dayEnd(addDays(todayStart, 7));

  const summary = {
    total: 0,
    today: 0,
    upcoming: 0,
    overdue: 0,
    awaitingParts: 0,
    unplanned: 0,
    completed: 0,
  };

  for (const item of items) {
    summary.total += 1;
    if (isCompletedStatus(item.status)) {
      summary.completed += 1;
      continue;
    }

    if (inDateRange(item.visitDate, todayStart, todayEnd)) summary.today += 1;
    if (item.visitDate && item.visitDate > todayEnd && item.visitDate <= weekEnd) summary.upcoming += 1;
    if (item.visitDate && item.visitDate < todayStart) summary.overdue += 1;
    if (!item.visitDate) summary.unplanned += 1;
    if (isAwaitingParts(item.status) || (!!item.dueDate && item.dueDate < now)) summary.awaitingParts += 1;
  }

  return summary;
}

router.get("/engineers", async (_req, res, next) => {
  try {
    const rows = await db
      .select({ engineerName: jobs.engineerName })
      .from(jobs)
      .where(sql`coalesce(trim(${jobs.engineerName}), '') <> ''`)
      .groupBy(jobs.engineerName)
      .orderBy(jobs.engineerName);

    return res.json({
      engineers: rows
        .map((row) => row.engineerName?.trim())
        .filter((value): value is string => !!value),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/jobs", async (req, res, next) => {
  try {
    const operator = req.session.engineerOperator!;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const selectedEngineer = typeof req.query.engineer === "string" ? req.query.engineer.trim() : "";
    const categoryInput = typeof req.query.category === "string" ? req.query.category : "all";
    const category: EngineerCategory = ["all", "today", "upcoming", "overdue", "awaiting_parts", "unplanned", "completed"].includes(categoryInput)
      ? (categoryInput as EngineerCategory)
      : "all";

    const canSelectEngineer = !!operator.canSelectEngineer;
    const effectiveNames = canSelectEngineer ? (selectedEngineer ? [selectedEngineer] : []) : operator.engineerNames;
    const nameFilters = toNameFilters(effectiveNames);

    if (nameFilters.length === 0) {
      return res.json({
        jobs: [],
        total: 0,
        page,
        pageSize,
        summary: { total: 0, today: 0, upcoming: 0, overdue: 0, awaitingParts: 0, unplanned: 0, completed: 0 },
        operator,
        selectedEngineer: selectedEngineer || null,
      });
    }

    const searchTerm = search ? `%${search}%` : null;
    const where = and(
      or(...nameFilters),
      searchTerm
        ? or(
            ilike(jobs.jobId, searchTerm),
            ilike(jobs.siteName, searchTerm),
            ilike(jobs.accountCode, searchTerm),
            ilike(jobs.shortDescription, searchTerm),
            ilike(jobs.jobType, searchTerm),
            ilike(jobs.status, searchTerm),
          )
        : undefined,
    );

    const rows = await db
      .select({
        jobId: jobs.jobId,
        accountCode: jobs.accountCode,
        accountName: customerAccounts.accountName,
        accountEmail: customerAccounts.email,
        siteName: jobs.siteName,
        status: jobs.status,
        sourcePortalStatus: jobs.sourcePortalStatus,
        jobType: jobs.jobType,
        priority: jobs.priority,
        shortDescription: jobs.shortDescription,
        engineerName: jobs.engineerName,
        dueDate: jobs.dueDate,
        visitDate: jobs.visitDate,
        nextActionDueDate: jobs.nextActionDueDate,
        lastVisitDate: jobs.lastVisitDate,
        lastUpdatedDate: jobs.lastUpdatedDate,
        equipment: jobs.equipment,
      })
      .from(jobs)
      .leftJoin(customerAccounts, eq(jobs.accountCode, customerAccounts.accountCode))
      .where(where)
      .orderBy(desc(jobs.visitDate), desc(jobs.lastUpdatedDate))
      .limit(1000);

    const summary = computeSummary(rows);
    const filtered = rows.filter((row) => matchesCategory(row, category));

    const offset = (page - 1) * pageSize;
    const paged = filtered.slice(offset, offset + pageSize);

    const jobIds = paged.map((row) => row.jobId);
    const poRows = jobIds.length > 0
      ? await db
          .select({
            jobId: purchaseOrders.jobId,
            poId: purchaseOrders.poId,
            poStatus: purchaseOrders.poStatus,
            etaDate: purchaseOrders.etaDate,
          })
          .from(purchaseOrders)
          .where(inArray(purchaseOrders.jobId, jobIds))
      : [];

    const poByJobId = new Map<string, Array<{ poId: string; poStatus: string; etaDate: Date | null }>>();
    for (const po of poRows) {
      if (!po.jobId) continue;
      const list = poByJobId.get(po.jobId) || [];
      list.push({ poId: po.poId, poStatus: po.poStatus, etaDate: po.etaDate });
      poByJobId.set(po.jobId, list);
    }

    const supportEmail = process.env.ENGINEER_SUPPORT_EMAIL || process.env.EMAIL_FROM || "service@lvcuk.com";
    const supportPhone = process.env.ENGINEER_SUPPORT_PHONE || "+442087790909";

    return res.json({
      jobs: paged.map((row) => ({
        ...row,
        purchaseOrders: poByJobId.get(row.jobId) || [],
      })),
      total: filtered.length,
      page,
      pageSize,
      summary,
      category,
      operator,
      selectedEngineer: selectedEngineer || null,
      support: {
        email: supportEmail,
        phone: supportPhone,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/jobs/:jobId", async (req, res, next) => {
  try {
    const operator = req.session.engineerOperator!;
    const selectedEngineer = typeof req.query.engineer === "string" ? req.query.engineer.trim() : "";
    const effectiveNames = operator.canSelectEngineer ? (selectedEngineer ? [selectedEngineer] : []) : operator.engineerNames;
    const nameFilters = toNameFilters(effectiveNames);

    if (nameFilters.length === 0) {
      return res.status(400).json({ message: "Engineer selection is required" });
    }

    const [job] = await db
      .select({
        jobId: jobs.jobId,
        accountCode: jobs.accountCode,
        accountName: customerAccounts.accountName,
        accountEmail: customerAccounts.email,
        siteName: jobs.siteName,
        status: jobs.status,
        sourcePortalStatus: jobs.sourcePortalStatus,
        jobType: jobs.jobType,
        priority: jobs.priority,
        shortDescription: jobs.shortDescription,
        engineerName: jobs.engineerName,
        dueDate: jobs.dueDate,
        visitDate: jobs.visitDate,
        nextActionDueDate: jobs.nextActionDueDate,
        lastVisitDate: jobs.lastVisitDate,
        lastUpdatedDate: jobs.lastUpdatedDate,
        equipment: jobs.equipment,
      })
      .from(jobs)
      .leftJoin(customerAccounts, eq(jobs.accountCode, customerAccounts.accountCode))
      .where(and(eq(jobs.jobId, req.params.jobId), or(...nameFilters)))
      .limit(1);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const linkedPurchaseOrders = await db
      .select({
        poId: purchaseOrders.poId,
        poStatus: purchaseOrders.poStatus,
        etaDate: purchaseOrders.etaDate,
        supplierName: purchaseOrders.supplierName,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.jobId, req.params.jobId));

    return res.json({ job, purchaseOrders: linkedPurchaseOrders });
  } catch (err) {
    next(err);
  }
});

export { router as engineersRouter };
