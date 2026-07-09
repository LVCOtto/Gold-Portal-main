import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, json, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userSessions = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

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
  sourcePortalStatus: text("source_portal_status"),
  jobType: text("job_type"),
  isWorkshop: boolean("is_workshop").notNull().default(false),
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

export const workshopBoardCards = pgTable("workshop_board_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull().unique(),
  boardLane: text("board_lane").notNull().default("entry"),
  laneOrder: integer("lane_order").notNull().default(0),
  sourceStatusAtLastSync: text("source_status_at_last_sync"),
  sourceJobType: text("source_job_type"),
  lastSeenInImportAt: timestamp("last_seen_in_import_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"),
  movedBy: text("moved_by"),
  movedAt: timestamp("moved_at"),
  lastEmailSentAt: timestamp("last_email_sent_at"),
  lastEmailOutcome: text("last_email_outcome"),
  partsEtaOverride: timestamp("parts_eta_override"),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workshopBoardEvents = pgTable("workshop_board_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull(),
  eventType: text("event_type").notNull(),
  fromLane: text("from_lane"),
  toLane: text("to_lane"),
  actor: text("actor").notNull(),
  payload: text("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const internalAccessUsers = pgTable("internal_access_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  canAdmin: boolean("can_admin").notNull().default(false),
  canWorkshop: boolean("can_workshop").notNull().default(false),
  canComms: boolean("can_comms").notNull().default(false),
  canCallbacks: boolean("can_callbacks").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("internal_access_users_email_idx").on(table.email),
  isActiveIdx: index("internal_access_users_is_active_idx").on(table.isActive),
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

export const insertWorkshopBoardCardSchema = createInsertSchema(workshopBoardCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkshopBoardEventSchema = createInsertSchema(workshopBoardEvents).omit({
  id: true,
  createdAt: true,
});

export const insertInternalAccessUserSchema = createInsertSchema(internalAccessUsers).omit({
  id: true,
  lastLoginAt: true,
  createdAt: true,
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

export type WorkshopBoardCard = typeof workshopBoardCards.$inferSelect;
export type InsertWorkshopBoardCard = z.infer<typeof insertWorkshopBoardCardSchema>;

export type WorkshopBoardEvent = typeof workshopBoardEvents.$inferSelect;
export type InsertWorkshopBoardEvent = z.infer<typeof insertWorkshopBoardEventSchema>;

export type InternalAccessUser = typeof internalAccessUsers.$inferSelect;
export type InsertInternalAccessUser = z.infer<typeof insertInternalAccessUserSchema>;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;

export type SystemSetting = typeof systemSettings.$inferSelect;

// ─────────────────────────────────────────────
// CALLBACKS PORTAL SYSTEM
// ─────────────────────────────────────────────

export const callbackJobSnapshots = pgTable("callback_job_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull().unique(),
  accountCode: text("account_code"),
  clientName: text("client_name"),
  siteName: text("site_name"),
  jobType: text("job_type"),
  status: text("status"),
  priority: text("priority"),
  shortDescription: text("short_description"),
  engineerName: text("engineer_name"),
  lastVisitDate: timestamp("last_visit_date"),
  visitDate: timestamp("visit_date"),
  nextActionDueDate: timestamp("next_action_due_date"),
  createdDate: timestamp("created_date"),
  lastUpdatedDate: timestamp("last_updated_date"),
  sourcePortalStatus: text("source_portal_status"),
  rawImportMetadata: text("raw_import_metadata"),
  importBatchId: varchar("import_batch_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("callback_snapshot_external_job_id_idx").on(table.externalJobId),
  accountCodeIdx: index("callback_snapshot_account_code_idx").on(table.accountCode),
  statusIdx: index("callback_snapshot_status_idx").on(table.status),
}));

export const callbackJobStates = pgTable("callback_job_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull().unique(),
  workflowStatus: text("workflow_status").notNull().default("awaiting_parts"),
  assignedOperator: text("assigned_operator"),
  escalationFlag: boolean("escalation_flag").notNull().default(false),
  escalationReason: text("escalation_reason"),
  manualAttentionRequired: boolean("manual_attention_required").notNull().default(false),
  teamTakeoverEligible: boolean("team_takeover_eligible").notNull().default(false),
  visitDateIsPast: boolean("visit_date_is_past").notNull().default(false),
  partsEtaDate: timestamp("parts_eta_date"),
  inferredEtaDate: timestamp("inferred_eta_date"),
  inferredEtaDerivedAt: timestamp("inferred_eta_derived_at"),
  lastKnownJobStatus: text("last_known_job_status"),
  lastCustomerUpdateSentAt: timestamp("last_customer_update_sent_at"),
  weeklyUpdateDueAt: timestamp("weekly_update_due_at"),
  consecutiveWeeklyUpdatesWithoutProgress: integer("consecutive_weekly_updates_without_progress").notNull().default(0),
  lastMeaningfulProgressAt: timestamp("last_meaningful_progress_at"),
  lastMeaningfulProgressType: text("last_meaningful_progress_type"),
  lastManualActionAt: timestamp("last_manual_action_at"),
  lastManualActionBy: text("last_manual_action_by"),
  internalTags: text("internal_tags"),
  bookedAt: timestamp("booked_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("callback_state_external_job_id_idx").on(table.externalJobId),
  workflowStatusIdx: index("callback_state_workflow_status_idx").on(table.workflowStatus),
  weeklyDueIdx: index("callback_state_weekly_due_idx").on(table.weeklyUpdateDueAt),
  escalationIdx: index("callback_state_escalation_idx").on(table.escalationFlag),
}));

export const callbackNotes = pgTable("callback_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull(),
  note: text("note").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("callback_notes_external_job_id_idx").on(table.externalJobId),
}));

export const callbackActionLog = pgTable("callback_action_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull(),
  actionType: text("action_type").notNull(),
  performedBy: text("performed_by").notNull(),
  payload: text("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("callback_action_external_job_id_idx").on(table.externalJobId),
  actionTypeIdx: index("callback_action_type_idx").on(table.actionType),
}));

export const callbackEmailTemplates = pgTable("callback_email_templates", {
  id: varchar("id").primaryKey(),
  displayName: text("display_name").notNull(),
  routeKey: text("route_key").notNull(),
  audience: text("audience").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const callbackEmailAudit = pgTable("callback_email_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull(),
  templateId: varchar("template_id"),
  audience: text("audience").notNull(),
  recipientEmail: text("recipient_email"),
  recipientName: text("recipient_name"),
  renderedSubject: text("rendered_subject"),
  renderedBody: text("rendered_body"),
  outcome: text("outcome").notNull(),
  errorMessage: text("error_message"),
  triggerType: text("trigger_type").notNull(),
  operatorId: text("operator_id"),
  metadata: text("metadata"),
  queuedAt: timestamp("queued_at"),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("callback_email_external_job_id_idx").on(table.externalJobId),
  outcomeIdx: index("callback_email_outcome_idx").on(table.outcome),
  createdAtIdx: index("callback_email_created_at_idx").on(table.createdAt),
}));

// ─────────────────────────────────────────────
// COMMS QUEUE SYSTEM
// ─────────────────────────────────────────────

// 1. Comms Job Snapshots — Protean read model, written only by import worker
export const commsJobSnapshots = pgTable("comms_job_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull().unique(),
  accountCode: text("account_code"),
  clientName: text("client_name"),
  siteName: text("site_name"),
  jobType: text("job_type"),
  status: text("status"),
  priority: text("priority"),
  shortDescription: text("short_description"),
  engineerName: text("engineer_name"),
  lastVisitDate: timestamp("last_visit_date"),
  nextActionDueDate: timestamp("next_action_due_date"),
  createdDate: timestamp("created_date"),
  lastUpdatedDate: timestamp("last_updated_date"),
  rawImportMetadata: text("raw_import_metadata"),
  importBatchId: varchar("import_batch_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("comms_snapshot_external_job_id_idx").on(table.externalJobId),
  accountCodeIdx: index("comms_snapshot_account_code_idx").on(table.accountCode),
}));

// 2. Comms Job States — portal-owned workflow state
export const commsJobStates = pgTable("comms_job_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull().unique(),
  commsStatus: text("comms_status").notNull().default("active"), // active | suppressed | paused | manual_hold | completed
  lastCommsSentAt: timestamp("last_comms_sent_at"),
  nextCommsDueAt: timestamp("next_comms_due_at"),
  suppressedAt: timestamp("suppressed_at"),
  suppressedBy: text("suppressed_by"),
  suppressionReason: text("suppression_reason"),
  lastKnownStatus: text("last_known_status"),
  statusChangedAt: timestamp("status_changed_at"),
  assignedOperator: text("assigned_operator"),
  templateOverrideKey: text("template_override_key"),
  escalationFlag: boolean("escalation_flag").notNull().default(false),
  internalTags: text("internal_tags"), // JSON array
  cooldownDaysOverride: integer("cooldown_days_override"),
  lastManualActionAt: timestamp("last_manual_action_at"),
  lastManualActionBy: text("last_manual_action_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("comms_state_external_job_id_idx").on(table.externalJobId),
  commsStatusIdx: index("comms_state_status_idx").on(table.commsStatus),
  nextDueIdx: index("comms_state_next_due_idx").on(table.nextCommsDueAt),
}));

// 3. Comms Notes — operator notes per job
export const commsNotes = pgTable("comms_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull(),
  note: text("note").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("comms_notes_external_job_id_idx").on(table.externalJobId),
}));

// 4. Comms Queue — state machine per job
export const commsQueue = pgTable("comms_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull(),
  state: text("state").notNull().default("due"), // due | processing | sent | failed | suppressed | manual_hold
  dueAt: timestamp("due_at").notNull(),
  lockedAt: timestamp("locked_at"),
  lockedBy: text("locked_by"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  batchId: varchar("batch_id"),
  triggerType: text("trigger_type").notNull().default("scheduled"), // scheduled | manual | status_change | import
  triggeredBy: text("triggered_by"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("comms_queue_external_job_id_idx").on(table.externalJobId),
  stateIdx: index("comms_queue_state_idx").on(table.state),
  dueAtIdx: index("comms_queue_due_at_idx").on(table.dueAt),
}));

// 5. Comms Templates — operator-editable message templates
export const commsTemplates = pgTable("comms_templates", {
  id: varchar("id").primaryKey(), // stable slug e.g. 'in_progress_update'
  displayName: text("display_name").notNull(),
  routeKey: text("route_key").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  tone: text("tone"), // formal | friendly | urgent
  operatorNotes: text("operator_notes"),
  defaultCooldownDays: integer("default_cooldown_days").notNull().default(7),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 6. Comms Template Versions — immutable edit history
export const commsTemplateVersions = pgTable("comms_template_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  snapshot: text("snapshot").notNull(), // JSON of full previous template row
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
}, (table) => ({
  templateIdIdx: index("comms_template_versions_template_id_idx").on(table.templateId),
}));

// 7. Comms Audit Log — append-only record of every send attempt
export const commsAuditLog = pgTable("comms_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  externalJobId: text("external_job_id").notNull(),
  queueItemId: varchar("queue_item_id"),
  triggerType: text("trigger_type").notNull(), // auto | manual
  templateId: varchar("template_id"),
  renderedSubject: text("rendered_subject"),
  renderedBody: text("rendered_body"),
  recipientEmail: text("recipient_email"),
  recipientName: text("recipient_name"),
  outcome: text("outcome").notNull(), // sent | failed | suppressed | skipped
  errorMessage: text("error_message"),
  operatorId: text("operator_id"),
  queuedAt: timestamp("queued_at"),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  metadata: text("metadata"), // JSON blob
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  externalJobIdIdx: index("comms_audit_external_job_id_idx").on(table.externalJobId),
  outcomeIdx: index("comms_audit_outcome_idx").on(table.outcome),
  createdAtIdx: index("comms_audit_created_at_idx").on(table.createdAt),
}));

// Comms Insert Schemas
export const insertCommsJobSnapshotSchema = createInsertSchema(commsJobSnapshots).omit({ id: true, lastSyncedAt: true });
export const insertCommsJobStateSchema = createInsertSchema(commsJobStates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCommsNoteSchema = createInsertSchema(commsNotes).omit({ id: true, createdAt: true });
export const insertCommsQueueSchema = createInsertSchema(commsQueue).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCommsTemplateVersionSchema = createInsertSchema(commsTemplateVersions).omit({ id: true, changedAt: true });
export const insertCommsAuditLogSchema = createInsertSchema(commsAuditLog).omit({ id: true, createdAt: true });

export const insertCallbackJobSnapshotSchema = createInsertSchema(callbackJobSnapshots).omit({ id: true, lastSyncedAt: true });
export const insertCallbackJobStateSchema = createInsertSchema(callbackJobStates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCallbackNoteSchema = createInsertSchema(callbackNotes).omit({ id: true, createdAt: true });
export const insertCallbackActionLogSchema = createInsertSchema(callbackActionLog).omit({ id: true, createdAt: true });
export const insertCallbackEmailAuditSchema = createInsertSchema(callbackEmailAudit).omit({ id: true, createdAt: true });

// Comms Types
export type CommsJobSnapshot = typeof commsJobSnapshots.$inferSelect;
export type InsertCommsJobSnapshot = z.infer<typeof insertCommsJobSnapshotSchema>;
export type CommsJobState = typeof commsJobStates.$inferSelect;
export type InsertCommsJobState = z.infer<typeof insertCommsJobStateSchema>;
export type CommsNote = typeof commsNotes.$inferSelect;
export type InsertCommsNote = z.infer<typeof insertCommsNoteSchema>;
export type CommsQueueItem = typeof commsQueue.$inferSelect;
export type InsertCommsQueueItem = z.infer<typeof insertCommsQueueSchema>;
export type CommsTemplate = typeof commsTemplates.$inferSelect;
export type CommsTemplateVersion = typeof commsTemplateVersions.$inferSelect;
export type InsertCommsTemplateVersion = z.infer<typeof insertCommsTemplateVersionSchema>;
export type CommsAuditLogEntry = typeof commsAuditLog.$inferSelect;
export type InsertCommsAuditLogEntry = z.infer<typeof insertCommsAuditLogSchema>;
export type CallbackJobSnapshot = typeof callbackJobSnapshots.$inferSelect;
export type InsertCallbackJobSnapshot = z.infer<typeof insertCallbackJobSnapshotSchema>;
export type CallbackJobState = typeof callbackJobStates.$inferSelect;
export type InsertCallbackJobState = z.infer<typeof insertCallbackJobStateSchema>;
export type CallbackNote = typeof callbackNotes.$inferSelect;
export type InsertCallbackNote = z.infer<typeof insertCallbackNoteSchema>;
export type CallbackActionLogEntry = typeof callbackActionLog.$inferSelect;
export type InsertCallbackActionLogEntry = z.infer<typeof insertCallbackActionLogSchema>;
export type CallbackEmailTemplate = typeof callbackEmailTemplates.$inferSelect;
export type CallbackEmailAuditEntry = typeof callbackEmailAudit.$inferSelect;
export type InsertCallbackEmailAuditEntry = z.infer<typeof insertCallbackEmailAuditSchema>;

export const WORKSHOP_LANES = [
  "entry",
  "booked_in",
  "on_the_bench",
  "quoted",
  "awaiting_parts",
  "repair_completed",
] as const;

export type WorkshopLane = typeof WORKSHOP_LANES[number];

export const WORKSHOP_LANE_LABELS: Record<WorkshopLane, string> = {
  entry: "Entry",
  booked_in: "Booked In",
  on_the_bench: "On The Bench",
  quoted: "Quoted",
  awaiting_parts: "Awaiting Parts",
  repair_completed: "Repair Completed",
};

export function isWorkshopLane(value: string): value is WorkshopLane {
  return (WORKSHOP_LANES as readonly string[]).includes(value);
}

export function getDefaultWorkshopLane(rawStatus: string): WorkshopLane {
  const normalized = rawStatus.toLowerCase();

  if (normalized.includes("awaiting parts") || normalized.includes("parts ordered") || normalized.includes("parts on order")) {
    return "awaiting_parts";
  }

  if (normalized.includes("quoted") || normalized.includes("quote") || normalized.includes("approval")) {
    return "quoted";
  }

  if (normalized.includes("completed") || normalized.includes("ready for collection") || normalized.includes("collection") || normalized.includes("return to site")) {
    return "repair_completed";
  }

  return "entry";
}

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
