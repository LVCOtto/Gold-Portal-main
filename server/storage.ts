import { 
  customerAccounts, jobs, quotes, purchaseOrders, importBatches, approvalEvents, systemSettings, jobOverrides, auditEvents,
  type CustomerAccount, type InsertCustomerAccount,
  type Job, type InsertJob,
  type Quote, type InsertQuote,
  type PurchaseOrder, type InsertPurchaseOrder,
  type ImportBatch, type InsertImportBatch,
  type ApprovalEvent, type InsertApprovalEvent,
  type JobOverride, type InsertJobOverride,
  type AuditEvent, type InsertAuditEvent,
  type SystemSetting
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, ilike, desc, asc, sql, gte } from "drizzle-orm";

export interface IStorage {
  // Customer Accounts
  getCustomerAccount(id: string): Promise<CustomerAccount | undefined>;
  getCustomerAccountByCode(accountCode: string): Promise<CustomerAccount | undefined>;
  createCustomerAccount(account: InsertCustomerAccount): Promise<CustomerAccount>;
  updateCustomerAccountPassword(accountCode: string, passwordHash: string): Promise<void>;
  setMustChangePassword(accountCode: string, mustChange: boolean): Promise<void>;
  updateCustomerLastLogin(accountCode: string): Promise<void>;
  getAllCustomerAccounts(search?: string): Promise<CustomerAccount[]>;

  // Jobs
  getJob(id: string): Promise<Job | undefined>;
  getJobByJobId(jobId: string, accountCode?: string): Promise<Job | undefined>;
  getJobs(filters: { accountCode?: string; search?: string; status?: string; priority?: string; page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<{ jobs: Job[]; total: number }>;
  createJob(job: InsertJob): Promise<Job>;
  deleteJobsByBatch(batchId: string): Promise<void>;
  clearAllJobs(): Promise<void>;

  // Quotes
  getQuote(id: string): Promise<Quote | undefined>;
  getQuoteByQuoteId(quoteId: string, accountCode?: string): Promise<Quote | undefined>;
  getQuotes(filters: { accountCode?: string; search?: string; status?: string; jobId?: string; page?: number; pageSize?: number }): Promise<{ quotes: Quote[]; total: number }>;
  getQuotesByJobId(jobId: string, accountCode?: string): Promise<Quote[]>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuoteStatus(quoteId: string, status: string): Promise<void>;
  deleteQuotesByBatch(batchId: string): Promise<void>;

  // Purchase Orders
  getPurchaseOrdersByJobId(jobId: string, accountCode?: string): Promise<PurchaseOrder[]>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  deletePurchaseOrdersByBatch(batchId: string): Promise<void>;

  // Import Batches
  getImportBatches(): Promise<ImportBatch[]>;
  createImportBatch(batch: InsertImportBatch): Promise<ImportBatch>;

  // Approval Events
  createApprovalEvent(event: InsertApprovalEvent): Promise<ApprovalEvent>;
  getApprovalEventsByQuoteId(quoteId: string): Promise<ApprovalEvent[]>;
  getApprovalEvents(filters: { search?: string; page?: number; pageSize?: number }): Promise<{ approvals: ApprovalEvent[]; total: number }>;
  getAllApprovalEvents(search?: string): Promise<ApprovalEvent[]>;

  // System Settings
  getSystemSetting(key: string): Promise<string | null>;
  setSystemSetting(key: string, value: string): Promise<void>;

  // Job Overrides
  getJobOverride(jobId: string): Promise<JobOverride | undefined>;
  getJobOverrides(): Promise<JobOverride[]>;
  upsertJobOverride(override: InsertJobOverride): Promise<JobOverride>;
  deleteJobOverride(jobId: string): Promise<void>;

  // Dashboard Stats
  getDashboardStats(accountCode: string): Promise<{ openJobs: number; awaitingApproval: number; awaitingParts: number; recentlyClosed: number }>;
  getAdminStats(): Promise<{ totalCustomers: number; totalJobs: number; totalQuotes: number; pendingApprovals: number; recentApprovals: number; lastImport: string | null }>;

  // Audit
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;
  getAuditEvents(filters: { actorType?: string; actorId?: string; action?: string; page?: number; pageSize?: number }): Promise<{ events: AuditEvent[]; total: number }>;
}

export class DatabaseStorage implements IStorage {
  // Customer Accounts
  async getCustomerAccount(id: string): Promise<CustomerAccount | undefined> {
    const [account] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, id));
    return account || undefined;
  }

  async getCustomerAccountByCode(accountCode: string): Promise<CustomerAccount | undefined> {
    const normalizedCode = accountCode.trim();
    const [account] = await db
      .select()
      .from(customerAccounts)
      .where(sql`lower(${customerAccounts.accountCode}) = lower(${normalizedCode})`)
      .limit(1);
    return account || undefined;
  }

  async createCustomerAccount(account: InsertCustomerAccount): Promise<CustomerAccount> {
    const [created] = await db.insert(customerAccounts).values(account).returning();
    return created;
  }

  async updateCustomerAccountPassword(accountCode: string, passwordHash: string): Promise<void> {
    await db.update(customerAccounts)
      .set({ passwordHash })
      .where(eq(customerAccounts.accountCode, accountCode));
  }

  async setMustChangePassword(accountCode: string, mustChange: boolean): Promise<void> {
    await db.update(customerAccounts)
      .set({ mustChangePassword: mustChange })
      .where(eq(customerAccounts.accountCode, accountCode));
  }

  async updateCustomerLastLogin(accountCode: string): Promise<void> {
    await db.update(customerAccounts)
      .set({ lastLoginAt: new Date() })
      .where(eq(customerAccounts.accountCode, accountCode));
  }

  async getAllCustomerAccounts(search?: string): Promise<CustomerAccount[]> {
    if (search) {
      return db.select().from(customerAccounts).where(
        or(
          ilike(customerAccounts.accountCode, `%${search}%`),
          ilike(customerAccounts.accountName, `%${search}%`)
        )
      ).orderBy(desc(customerAccounts.createdAt));
    }
    return db.select().from(customerAccounts).orderBy(desc(customerAccounts.createdAt));
  }

  // Jobs
  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async getJobByJobId(jobId: string, accountCode?: string): Promise<Job | undefined> {
    const conditions = [eq(jobs.jobId, jobId)];
    if (accountCode) conditions.push(eq(jobs.accountCode, accountCode));
    
    const [job] = await db.select().from(jobs).where(and(...conditions));
    return job || undefined;
  }

  async getJobs(filters: { accountCode?: string; search?: string; status?: string; priority?: string; page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<{ jobs: Job[]; total: number }> {
    const { accountCode, search, status, priority, page = 1, pageSize = 10, sortBy = 'lastUpdatedDate', sortOrder = 'desc' } = filters;
    const conditions = [];
    
    if (accountCode) conditions.push(eq(jobs.accountCode, accountCode));
    if (search) {
      conditions.push(
        or(
          ilike(jobs.jobId, `%${search}%`),
          ilike(jobs.siteName, `%${search}%`),
          ilike(jobs.shortDescription, `%${search}%`)
        )!
      );
    }
    if (status && status !== "all") {
      if (status === "open") {
        conditions.push(
          and(
            sql`lower(${jobs.status}) NOT LIKE '%completed%'`,
            sql`lower(${jobs.status}) NOT LIKE '%closed%'`,
            sql`lower(${jobs.status}) NOT LIKE '%cancelled%'`
          )!
        );
      } else {
        conditions.push(ilike(jobs.status, `%${status.replace(/_/g, '%')}%`));
      }
    }
    if (priority && priority !== "all") {
      conditions.push(ilike(jobs.priority, `%${priority}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(whereClause);
    const total = Number(countResult.count);
    
    // Map sortBy field to column
    const sortColumn = (() => {
      switch (sortBy) {
        case 'jobId': return jobs.jobId;
        case 'siteName': return jobs.siteName;
        case 'status': return jobs.status;
        case 'visitDate': return jobs.visitDate;
        case 'dueDate': return jobs.dueDate;
        case 'lastUpdatedDate': 
        default: return jobs.lastUpdatedDate;
      }
    })();
    
    const orderFn = sortOrder === 'asc' ? asc : desc;
    
    const result = await db.select().from(jobs)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { jobs: result, total };
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async deleteJobsByBatch(batchId: string): Promise<void> {
    await db.delete(jobs).where(eq(jobs.importBatchId, batchId));
  }

  async clearAllJobs(): Promise<void> {
    await db.delete(jobs);
  }

  // Quotes
  async getQuote(id: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote || undefined;
  }

  async getQuoteByQuoteId(quoteId: string, accountCode?: string): Promise<Quote | undefined> {
    const conditions = [eq(quotes.quoteId, quoteId)];
    if (accountCode) conditions.push(eq(quotes.accountCode, accountCode));
    
    const [quote] = await db.select().from(quotes).where(and(...conditions));
    return quote || undefined;
  }

  async getQuotes(filters: { accountCode?: string; search?: string; status?: string; jobId?: string; page?: number; pageSize?: number }): Promise<{ quotes: Quote[]; total: number }> {
    const { accountCode, search, status, jobId, page = 1, pageSize = 10 } = filters;
    const conditions = [];
    
    if (accountCode) conditions.push(eq(quotes.accountCode, accountCode));
    if (search) {
      conditions.push(
        or(
          ilike(quotes.quoteId, `%${search}%`),
          ilike(quotes.jobId, `%${search}%`)
        )!
      );
    }
    if (status && status !== "all") {
      conditions.push(ilike(quotes.quoteStatus, `%${status.replace(/_/g, '%')}%`));
    }
    if (jobId) {
      conditions.push(eq(quotes.jobId, jobId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(quotes).where(whereClause);
    const total = Number(countResult.count);
    
    const result = await db.select().from(quotes)
      .where(whereClause)
      .orderBy(desc(quotes.quoteDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { quotes: result, total };
  }

  async getQuotesByJobId(jobId: string, accountCode?: string): Promise<Quote[]> {
    const conditions = [eq(quotes.jobId, jobId)];
    if (accountCode) conditions.push(eq(quotes.accountCode, accountCode));
    
    return db.select().from(quotes).where(and(...conditions)).orderBy(desc(quotes.quoteDate));
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [created] = await db.insert(quotes).values(quote).returning();
    return created;
  }

  async updateQuoteStatus(quoteId: string, status: string): Promise<void> {
    await db.update(quotes).set({ quoteStatus: status }).where(eq(quotes.quoteId, quoteId));
  }

  async deleteQuotesByBatch(batchId: string): Promise<void> {
    await db.delete(quotes).where(eq(quotes.importBatchId, batchId));
  }

  // Purchase Orders
  async getPurchaseOrdersByJobId(jobId: string, accountCode?: string): Promise<PurchaseOrder[]> {
    const conditions = [eq(purchaseOrders.jobId, jobId)];
    if (accountCode) conditions.push(eq(purchaseOrders.accountCode, accountCode));
    
    return db.select().from(purchaseOrders).where(and(...conditions));
  }

  async createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [created] = await db.insert(purchaseOrders).values(po).returning();
    return created;
  }

  async deletePurchaseOrdersByBatch(batchId: string): Promise<void> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.importBatchId, batchId));
  }

  // Import Batches
  async getImportBatches(): Promise<ImportBatch[]> {
    return db.select().from(importBatches).orderBy(desc(importBatches.importedAt));
  }

  async createImportBatch(batch: InsertImportBatch): Promise<ImportBatch> {
    const [created] = await db.insert(importBatches).values(batch).returning();
    return created;
  }

  // Approval Events
  async createApprovalEvent(event: InsertApprovalEvent): Promise<ApprovalEvent> {
    const [created] = await db.insert(approvalEvents).values(event).returning();
    return created;
  }

  async getApprovalEventsByQuoteId(quoteId: string): Promise<ApprovalEvent[]> {
    return db.select().from(approvalEvents).where(eq(approvalEvents.quoteId, quoteId)).orderBy(desc(approvalEvents.capturedAt));
  }

  async getApprovalEvents(filters: { search?: string; page?: number; pageSize?: number }): Promise<{ approvals: ApprovalEvent[]; total: number }> {
    const { search, page = 1, pageSize = 10 } = filters;
    const conditions = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(approvalEvents.quoteId, `%${search}%`),
          ilike(approvalEvents.jobId, `%${search}%`),
          ilike(approvalEvents.accountCode, `%${search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(approvalEvents).where(whereClause);
    const total = Number(countResult.count);
    
    const result = await db.select().from(approvalEvents)
      .where(whereClause)
      .orderBy(desc(approvalEvents.capturedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { approvals: result, total };
  }

  async getAllApprovalEvents(search?: string): Promise<ApprovalEvent[]> {
    if (search) {
      return db.select().from(approvalEvents).where(
        or(
          ilike(approvalEvents.quoteId, `%${search}%`),
          ilike(approvalEvents.jobId, `%${search}%`),
          ilike(approvalEvents.accountCode, `%${search}%`)
        )
      ).orderBy(desc(approvalEvents.capturedAt));
    }
    return db.select().from(approvalEvents).orderBy(desc(approvalEvents.capturedAt));
  }

  // System Settings
  async getSystemSetting(key: string): Promise<string | null> {
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return setting?.value ?? null;
  }

  async setSystemSetting(key: string, value: string): Promise<void> {
    await db.insert(systemSettings).values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: new Date() } });
  }

  // Job Overrides
  async getJobOverride(jobId: string): Promise<JobOverride | undefined> {
    const [override] = await db.select().from(jobOverrides).where(eq(jobOverrides.jobId, jobId));
    return override || undefined;
  }

  async getJobOverrides(): Promise<JobOverride[]> {
    return db.select().from(jobOverrides).orderBy(desc(jobOverrides.updatedAt));
  }

  async upsertJobOverride(override: InsertJobOverride): Promise<JobOverride> {
    const [result] = await db.insert(jobOverrides)
      .values({ ...override, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: jobOverrides.jobId,
        set: {
          displayStatus: override.displayStatus,
          adminNotes: override.adminNotes,
          internalNotes: override.internalNotes,
          dateOverride: override.dateOverride,
          statusAtOverride: override.statusAtOverride,
          updatedBy: override.updatedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteJobOverride(jobId: string): Promise<void> {
    await db.delete(jobOverrides).where(eq(jobOverrides.jobId, jobId));
  }

  // Dashboard Stats
  async getDashboardStats(accountCode: string): Promise<{ openJobs: number; awaitingApproval: number; awaitingParts: number; recentlyClosed: number; quotedJobs: number }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [openJobsResult] = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(
      and(
        eq(jobs.accountCode, accountCode),
        sql`lower(${jobs.status}) NOT LIKE '%completed%'`,
        sql`lower(${jobs.status}) NOT LIKE '%closed%'`,
        sql`lower(${jobs.status}) NOT LIKE '%cancelled%'`
      )
    );

    // Count jobs with "Quoted" status as awaiting approval
    const [awaitingApprovalResult] = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(
      and(
        eq(jobs.accountCode, accountCode),
        ilike(jobs.status, '%quoted%')
      )
    );

    const [awaitingPartsResult] = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(
      and(
        eq(jobs.accountCode, accountCode),
        or(
          ilike(jobs.status, '%awaiting_parts%'),
          ilike(jobs.status, '%parts%ordered%')
        )
      )
    );

    const [recentlyClosedResult] = await db.select({ count: sql<number>`count(*)` }).from(jobs).where(
      and(
        eq(jobs.accountCode, accountCode),
        or(
          ilike(jobs.status, '%completed%'),
          ilike(jobs.status, '%closed%')
        ),
        gte(jobs.lastUpdatedDate, thirtyDaysAgo)
      )
    );

    return {
      openJobs: Number(openJobsResult.count),
      awaitingApproval: Number(awaitingApprovalResult.count),
      awaitingParts: Number(awaitingPartsResult.count),
      recentlyClosed: Number(recentlyClosedResult.count),
      quotedJobs: Number(awaitingApprovalResult.count),
    };
  }

  async getAdminStats(): Promise<{ totalCustomers: number; totalJobs: number; totalQuotes: number; pendingApprovals: number; recentApprovals: number; lastImport: string | null }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [customersResult] = await db.select({ count: sql<number>`count(*)` }).from(customerAccounts);
    const [jobsResult] = await db.select({ count: sql<number>`count(*)` }).from(jobs);
    const [quotesResult] = await db.select({ count: sql<number>`count(*)` }).from(quotes);
    
    const [pendingResult] = await db.select({ count: sql<number>`count(*)` }).from(quotes).where(
      or(
        ilike(quotes.quoteStatus, '%awaiting%'),
        ilike(quotes.quoteStatus, '%pending%')
      )
    );

    const [recentApprovalsResult] = await db.select({ count: sql<number>`count(*)` }).from(approvalEvents).where(
      gte(approvalEvents.capturedAt, sevenDaysAgo)
    );

    const lastImport = await this.getSystemSetting("last_import");

    return {
      totalCustomers: Number(customersResult.count),
      totalJobs: Number(jobsResult.count),
      totalQuotes: Number(quotesResult.count),
      pendingApprovals: Number(pendingResult.count),
      recentApprovals: Number(recentApprovalsResult.count),
      lastImport,
    };
  }

  // Audit
  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [created] = await db.insert(auditEvents).values(event).returning();
    return created;
  }

  async getAuditEvents(filters: { actorType?: string; actorId?: string; action?: string; page?: number; pageSize?: number }): Promise<{ events: AuditEvent[]; total: number }> {
    const page = filters.page || 1;
    const pageSize = Math.min(filters.pageSize || 50, 200);
    const conditions: any[] = [];
    if (filters.actorType) conditions.push(eq(auditEvents.actorType, filters.actorType));
    if (filters.actorId) conditions.push(eq(auditEvents.actorId, filters.actorId));
    if (filters.action) conditions.push(ilike(auditEvents.action, `%${filters.action}%`));
    const where = conditions.length ? and(...conditions) : undefined;
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(auditEvents).where(where as any);
    const events = await db.select().from(auditEvents)
      .where(where as any)
      .orderBy(desc(auditEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { events, total: Number(count) };
  }
}

export const storage = new DatabaseStorage();
