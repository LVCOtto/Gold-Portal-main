/**
 * Comms Import Worker
 *
 * Syncs the active job data from the existing `jobs` table (which is already kept
 * current by live-import.ts) into `comms_job_snapshots` + `comms_job_states`.
 *
 * It also detects status changes and optionally pulls the next_comms_due_at forward,
 * and creates initial queue entries for brand-new jobs.
 */

import { db } from "../db";
import { jobs, customerAccounts } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import {
  upsertCommsSnapshot,
  getCommsState,
  getOrCreateCommsState,
  updateCommsState,
  enqueueCommsJob,
  getDueCount,
} from "./comms-storage";
import { log } from "../index";

let isCommsImportRunning = false;

// Statuses that warrant pulling the comms timer forward when they change
const URGENT_STATUS_TRANSITIONS = new Set([
  "completed",
  "cancelled",
  "closed",
  "escalated",
  "awaiting approval",
  "approved",
]);

function statusChanged(prev: string | null, next: string | null): boolean {
  if (!prev || !next) return false;
  return prev.trim().toLowerCase() !== next.trim().toLowerCase();
}

function isCompletedStatus(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("completed") || s.includes("closed") || s.includes("cancelled");
}

/**
 * Run a comms import sync — reads all active jobs from the existing jobs table
 * and upserts them into comms_job_snapshots + comms_job_states.
 */
export async function runCommsImport(triggeredBy = "system"): Promise<{
  processed: number;
  newJobs: number;
  statusChanges: number;
  errors: number;
}> {
  if (isCommsImportRunning) {
    log("Comms import already in progress — skipping", "comms-import");
    return { processed: 0, newJobs: 0, statusChanges: 0, errors: 0 };
  }
  isCommsImportRunning = true;

  let processed = 0;
  let newJobs = 0;
  let statusChanges = 0;
  let errors = 0;

  try {
    // Fetch all jobs + account names in one join
    const allJobs = await db
      .select({
        jobId: jobs.jobId,
        accountCode: jobs.accountCode,
        accountName: customerAccounts.accountName,
        siteName: jobs.siteName,
        jobType: jobs.jobType,
        status: jobs.status,
        priority: jobs.priority,
        shortDescription: jobs.shortDescription,
        engineerName: jobs.engineerName,
        lastVisitDate: jobs.lastVisitDate,
        nextActionDueDate: jobs.nextActionDueDate,
        createdDate: jobs.createdDate,
        lastUpdatedDate: jobs.lastUpdatedDate,
        sourcePortalStatus: jobs.sourcePortalStatus,
        isWorkshop: jobs.isWorkshop,
        importBatchId: jobs.importBatchId,
      })
      .from(jobs)
      .leftJoin(customerAccounts, eq(jobs.accountCode, customerAccounts.accountCode))
      .orderBy(desc(jobs.lastUpdatedDate));

    for (const job of allJobs) {
      try {
        // Upsert the snapshot
        await upsertCommsSnapshot({
          externalJobId: job.jobId,
          accountCode: job.accountCode,
          clientName: job.accountName ?? null,
          siteName: job.siteName,
          jobType: job.jobType ?? null,
          status: job.status,
          priority: job.priority ?? null,
          shortDescription: job.shortDescription,
          engineerName: job.engineerName ?? null,
          lastVisitDate: job.lastVisitDate ?? null,
          nextActionDueDate: job.nextActionDueDate ?? null,
          createdDate: job.createdDate,
          lastUpdatedDate: job.lastUpdatedDate,
          rawImportMetadata: JSON.stringify({
            sourcePortalStatus: job.sourcePortalStatus,
            isWorkshop: job.isWorkshop,
            importBatchId: job.importBatchId,
          }),
          importBatchId: job.importBatchId ?? null,
        });

        // Check existing state
        const existingState = await getCommsState(job.jobId);

        if (!existingState) {
          // Brand-new job entering the comms system
          await getOrCreateCommsState(job.jobId);
          await enqueueCommsJob(job.jobId, {
            triggerType: "import",
            triggeredBy,
            dueAt: new Date(),
          });
          newJobs++;
        } else {
          // Detect status change
          if (statusChanged(existingState.lastKnownStatus, job.status)) {
            const isCompleted = isCompletedStatus(job.status);
            const isUrgent = URGENT_STATUS_TRANSITIONS.has(job.status.trim().toLowerCase());

            // If job completed/cancelled, mark comms as completed
            if (isCompleted && existingState.commsStatus === "active") {
              await updateCommsState(job.jobId, {
                commsStatus: "completed",
                lastKnownStatus: job.status,
                statusChangedAt: new Date(),
              });
            } else if (!isCompleted && existingState.commsStatus !== "suppressed" && existingState.commsStatus !== "paused") {
              // Pull forward the due date on urgent status changes
              const pullForward = isUrgent;
              await updateCommsState(job.jobId, {
                lastKnownStatus: job.status,
                statusChangedAt: new Date(),
                ...(pullForward ? { nextCommsDueAt: new Date() } : {}),
              });

              if (pullForward) {
                // Queue an immediate update
                await enqueueCommsJob(job.jobId, {
                  triggerType: "status_change",
                  triggeredBy,
                  dueAt: new Date(),
                });
              }
            } else {
              await updateCommsState(job.jobId, {
                lastKnownStatus: job.status,
                statusChangedAt: new Date(),
              });
            }
            statusChanges++;
          }
        }
        processed++;
      } catch (err) {
        errors++;
        log(`Comms import error for job ${job.jobId}: ${err instanceof Error ? err.message : String(err)}`, "comms-import");
      }
    }

    log(
      `Comms import complete — ${processed} processed, ${newJobs} new, ${statusChanges} status changes, ${errors} errors`,
      "comms-import",
    );
  } finally {
    isCommsImportRunning = false;
  }

  return { processed, newJobs, statusChanges, errors };
}

/**
 * Starts the comms auto-import on a scheduled interval.
 * Runs after the main live-import so it picks up freshly synced data.
 */
export function startCommsAutoImport(): void {
  const intervalMs = Math.max(
    Number.parseInt(process.env.COMMS_IMPORT_INTERVAL_MS || "90000", 10) || 90000,
    30000,
  );

  // Delay first run to allow main import to finish first
  setTimeout(async () => {
    log("Running initial comms import sync...", "comms-import");
    await runCommsImport("auto-startup").catch((err) =>
      log(`Initial comms import failed: ${err instanceof Error ? err.message : String(err)}`, "comms-import"),
    );

    setInterval(async () => {
      await runCommsImport("auto-scheduled").catch((err) =>
        log(`Scheduled comms import failed: ${err instanceof Error ? err.message : String(err)}`, "comms-import"),
      );
    }, intervalMs);
  }, 15000);

  log(`Comms auto-import scheduled every ${intervalMs / 1000}s`, "comms-import");
}
