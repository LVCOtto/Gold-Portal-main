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

type EngineerCategory = "available" | "planned" | "attention" | "awaiting_parts" | "completed" | "all";

type CategorisableJob = {
  status: string;
  sourcePortalStatus: string | null;
  visitDate: Date | null;
};

function isCompletedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized.includes("complete") || normalized.includes("closed") || normalized.includes("cancelled");
}

function isAwaitingParts(job: Pick<CategorisableJob, "status" | "sourcePortalStatus">): boolean {
  const workflowText = `${job.status} ${job.sourcePortalStatus || ""}`.trim().toLowerCase();
  return workflowText.includes("awaiting parts") || workflowText.includes("parts required") || workflowText.includes("parts on order");
}

function dayStart(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function categoryForJob(job: CategorisableJob): Exclude<EngineerCategory, "all"> {
  if (isCompletedStatus(job.status)) return "completed";
  if (isAwaitingParts(job)) return "awaiting_parts";
  if (job.visitDate && job.visitDate < dayStart(new Date())) return "attention";
  if (job.visitDate) return "planned";
  return "available";
}

function sortOperationally<T extends CategorisableJob & { dueDate: Date | null; lastUpdatedDate: Date }>(items: T[], category: EngineerCategory): T[] {
  return [...items].sort((left, right) => {
    if (category === "planned" || category === "attention") {
      return (left.visitDate?.getTime() || 0) - (right.visitDate?.getTime() || 0);
    }
    if (category === "awaiting_parts") {
      const leftDue = left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    }
    return right.lastUpdatedDate.getTime() - left.lastUpdatedDate.getTime();
  });
}

function computeSummary(items: CategorisableJob[]) {
  const summary = {
    total: 0,
    available: 0,
    planned: 0,
    attention: 0,
    awaitingParts: 0,
    completed: 0,
  };

  for (const item of items) {
    summary.total += 1;
    const category = categoryForJob(item);
    if (category === "available") summary.available += 1;
    if (category === "planned") summary.planned += 1;
    if (category === "attention") summary.attention += 1;
    if (category === "awaiting_parts") summary.awaitingParts += 1;
    if (category === "completed") summary.completed += 1;
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
    const categoryInput = typeof req.query.category === "string" ? req.query.category : "available";
    const category: EngineerCategory = ["available", "planned", "attention", "awaiting_parts", "completed", "all"].includes(categoryInput)
      ? (categoryInput as EngineerCategory)
      : "available";

    const canSelectEngineer = !!operator.canSelectEngineer;
    const effectiveNames = canSelectEngineer ? (selectedEngineer ? [selectedEngineer] : []) : operator.engineerNames;
    const nameFilters = toNameFilters(effectiveNames);

    if (nameFilters.length === 0) {
      return res.json({
        jobs: [],
        total: 0,
        page,
        pageSize,
        summary: { total: 0, available: 0, planned: 0, attention: 0, awaitingParts: 0, completed: 0 },
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
    const matchingRows = category === "all" ? rows : rows.filter((row) => categoryForJob(row) === category);
    const filtered = sortOperationally(matchingRows, category);

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
