import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Customer Accounts
export const customerAccounts = pgTable("customer_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountCode: text("account_code").notNull().unique(),
  accountName: text("account_name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customerAccountsRelations = relations(customerAccounts, ({ many }) => ({
  jobs: many(jobs),
  quotes: many(quotes),
  approvalEvents: many(approvalEvents),
}));

// Jobs
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull(),
  accountCode: text("account_code").notNull(),
  siteName: text("site_name").notNull(),
  status: text("status").notNull(),
  createdDate: timestamp("created_date").notNull(),
  lastUpdatedDate: timestamp("last_updated_date").notNull(),
  shortDescription: text("short_description").notNull(),
  engineerName: text("engineer_name"),
  lastVisitDate: timestamp("last_visit_date"),
  nextActionDueDate: timestamp("next_action_due_date"),
  priority: text("priority"),
  jobValueEstimate: decimal("job_value_estimate", { precision: 10, scale: 2 }),
  dueDate: timestamp("due_date"), // Manual date for parts arrival (Awaiting Parts)
  visitDate: timestamp("visit_date"), // Assigned engineer visit date
  equipment: text("equipment"), // Semicolon-separated list of equipment
  importBatchId: varchar("import_batch_id"),
});

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  account: one(customerAccounts, {
    fields: [jobs.accountCode],
    references: [customerAccounts.accountCode],
  }),
  quotes: many(quotes),
  importBatch: one(importBatches, {
    fields: [jobs.importBatchId],
    references: [importBatches.id],
  }),
}));

// Quotes
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: text("quote_id").notNull(),
  jobId: text("job_id"),
  accountCode: text("account_code").notNull(),
  quoteStatus: text("quote_status").notNull(),
  netTotal: decimal("net_total", { precision: 10, scale: 2 }).notNull(),
  vatTotal: decimal("vat_total", { precision: 10, scale: 2 }).notNull(),
  grossTotal: decimal("gross_total", { precision: 10, scale: 2 }).notNull(),
  quoteDate: timestamp("quote_date").notNull(),
  leadTimeText: text("lead_time_text"),
  pdfUrl: text("pdf_url"),
  quoteTextSummary: text("quote_text_summary"),
  topLinesSummary: text("top_lines_summary"),
  importBatchId: varchar("import_batch_id"),
});

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  account: one(customerAccounts, {
    fields: [quotes.accountCode],
    references: [customerAccounts.accountCode],
  }),
  job: one(jobs, {
    fields: [quotes.jobId],
    references: [jobs.jobId],
  }),
  approvalEvents: many(approvalEvents),
  importBatch: one(importBatches, {
    fields: [quotes.importBatchId],
    references: [importBatches.id],
  }),
}));

// Purchase Orders (optional)
export const purchaseOrders = pgTable("purchase_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  poId: text("po_id").notNull(),
  accountCode: text("account_code").notNull(),
  jobId: text("job_id"),
  supplierName: text("supplier_name"),
  poStatus: text("po_status").notNull(),
  outstandingLinesCount: integer("outstanding_lines_count"),
  etaDate: timestamp("eta_date"),
  lastChasedDate: timestamp("last_chased_date"),
  importBatchId: varchar("import_batch_id"),
});

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one }) => ({
  account: one(customerAccounts, {
    fields: [purchaseOrders.accountCode],
    references: [customerAccounts.accountCode],
  }),
  job: one(jobs, {
    fields: [purchaseOrders.jobId],
    references: [jobs.jobId],
  }),
  importBatch: one(importBatches, {
    fields: [purchaseOrders.importBatchId],
    references: [importBatches.id],
  }),
}));

// Import Batches
export const importBatches = pgTable("import_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  importedBy: text("imported_by").notNull(),
  fileType: text("file_type").notNull(), // 'jobs', 'quotes', 'purchase_orders'
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  errorCount: integer("error_count").default(0),
  errors: text("errors"), // JSON string of error details
});

// Approval Events
export const approvalEvents = pgTable("approval_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: text("quote_id").notNull(),
  jobId: text("job_id"),
  accountCode: text("account_code").notNull(),
  approverName: text("approver_name").notNull(),
  approverEmail: text("approver_email").notNull(),
  customerPoNumber: text("customer_po_number"),
  termsAccepted: boolean("terms_accepted").notNull().default(true),
  capturedAt: timestamp("captured_at").defaultNow().notNull(),
  payload: text("payload"), // JSON string of additional data
});

export const approvalEventsRelations = relations(approvalEvents, ({ one }) => ({
  account: one(customerAccounts, {
    fields: [approvalEvents.accountCode],
    references: [customerAccounts.accountCode],
  }),
  quote: one(quotes, {
    fields: [approvalEvents.quoteId],
    references: [quotes.quoteId],
  }),
}));

// Job Overrides - Admin manual notes and status overrides
export const jobOverrides = pgTable("job_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull().unique(), // References jobs.jobId
  displayStatus: text("display_status"), // Optional status override for customer display
  adminNotes: text("admin_notes"), // Notes visible to customers explaining the situation
  internalNotes: text("internal_notes"), // Notes only visible to admins
  dateOverride: timestamp("date_override"), // Admin-specified date to show (parts/visit ETA)
  statusAtOverride: text("status_at_override"), // Status when override was set (resets if status changes)
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const jobOverridesRelations = relations(jobOverrides, ({ one }) => ({
  job: one(jobs, {
    fields: [jobOverrides.jobId],
    references: [jobs.jobId],
  }),
}));

// System Settings (for last import timestamp)
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Audit Events - Append-only log of security-relevant actions
export const auditEvents = pgTable("audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorType: text("actor_type").notNull(), // 'admin' | 'customer' | 'system'
  actorId: text("actor_id"), // accountCode for customers, 'admin' for shared admin
  action: text("action").notNull(), // e.g. 'login.success', 'override.upsert', 'import.replace'
  targetType: text("target_type"),
  targetId: text("target_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  payload: text("payload"), // JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert Schemas
export const insertCustomerAccountSchema = createInsertSchema(customerAccounts).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
});

export const insertImportBatchSchema = createInsertSchema(importBatches).omit({
  id: true,
});

export const insertApprovalEventSchema = createInsertSchema(approvalEvents).omit({
  id: true,
  capturedAt: true,
});

export const insertJobOverrideSchema = createInsertSchema(jobOverrides).omit({
  id: true,
  updatedAt: true,
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  createdAt: true,
});

// Types
export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type InsertCustomerAccount = z.infer<typeof insertCustomerAccountSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type ImportBatch = typeof importBatches.$inferSelect;
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;

export type ApprovalEvent = typeof approvalEvents.$inferSelect;
export type InsertApprovalEvent = z.infer<typeof insertApprovalEventSchema>;

export type JobOverride = typeof jobOverrides.$inferSelect;
export type InsertJobOverride = z.infer<typeof insertJobOverrideSchema>;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;

export type SystemSetting = typeof systemSettings.$inferSelect;

// Status Mapping
export const STATUS_MAPPING: Record<string, { label: string; lane: string; color: string }> = {
  // Awaiting Approval
  'awaiting_approval': { label: 'Awaiting Approval', lane: 'awaiting_approval', color: 'warning' },
  'pending_approval': { label: 'Pending Approval', lane: 'awaiting_approval', color: 'warning' },
  'quote_sent': { label: 'Quote Sent', lane: 'awaiting_approval', color: 'warning' },
  
  // Awaiting Parts
  'awaiting_parts': { label: 'Awaiting Parts', lane: 'awaiting_parts', color: 'info' },
  'parts_ordered': { label: 'Parts Ordered', lane: 'awaiting_parts', color: 'info' },
  'parts_on_order': { label: 'Parts On Order', lane: 'awaiting_parts', color: 'info' },
  
  // In Progress
  'in_progress': { label: 'In Progress', lane: 'in_progress', color: 'primary' },
  'scheduled': { label: 'Scheduled', lane: 'in_progress', color: 'primary' },
  'engineer_assigned': { label: 'Engineer Assigned', lane: 'in_progress', color: 'primary' },
  'work_in_progress': { label: 'Work In Progress', lane: 'in_progress', color: 'primary' },
  'approved_pending_internal_processing': { label: 'Approved - Processing', lane: 'in_progress', color: 'primary' },
  
  // Completed/Closed
  'completed': { label: 'Completed', lane: 'completed', color: 'success' },
  'closed': { label: 'Closed', lane: 'completed', color: 'success' },
  'invoiced': { label: 'Invoiced', lane: 'completed', color: 'success' },
  'approved': { label: 'Approved', lane: 'completed', color: 'success' },
  
  // On Hold / Delayed
  'on_hold': { label: 'On Hold', lane: 'on_hold', color: 'muted' },
  'delayed': { label: 'Delayed', lane: 'on_hold', color: 'muted' },
  'cancelled': { label: 'Cancelled', lane: 'on_hold', color: 'destructive' },
  'rejected': { label: 'Rejected', lane: 'on_hold', color: 'destructive' },
};

export function getStatusInfo(rawStatus: string): { label: string; lane: string; color: string; rawStatus: string } {
  const normalized = rawStatus.toLowerCase().replace(/[\s-]+/g, '_');
  const mapped = STATUS_MAPPING[normalized];
  if (mapped) {
    return { ...mapped, rawStatus };
  }
  return { label: rawStatus, lane: 'in_progress', color: 'secondary', rawStatus };
}

// Lane labels for UI
export const LANE_LABELS: Record<string, string> = {
  'awaiting_approval': 'Awaiting Approval',
  'awaiting_parts': 'Awaiting Parts',
  'in_progress': 'In Progress',
  'completed': 'Completed/Closed',
  'on_hold': 'On Hold / Delayed',
};
