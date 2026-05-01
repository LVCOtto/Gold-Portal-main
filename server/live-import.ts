import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parse as dateFnsParse, isValid as isValidDate } from "date-fns";
import { storage } from "./storage";

const DEFAULT_LIVE_JOBS_PATH = "T:\\LVC General\\LVC Staff\\Otto\\Exports\\Job Live Status Hub.csv";
const liveJobsPath = process.env.AUTO_IMPORT_JOBS_PATH || DEFAULT_LIVE_JOBS_PATH;
const autoImportEnabled = process.env.AUTO_IMPORT_ENABLED !== "false";
const autoImportIntervalMs = Math.max(Number.parseInt(process.env.AUTO_IMPORT_INTERVAL_MS || "60000", 10) || 60000, 15000);

let lastSeenSignature: string | null = null;
let isImportRunning = false;
let hasLoggedMissingFile = false;

function excelSerialToDate(serial: number): Date {
  const excelEpoch = new Date(1899, 11, 30);
  const days = Math.floor(serial);
  return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseFlexibleDate(dateStr: unknown): Date | null {
  if (dateStr === null || dateStr === undefined) return null;

  if (dateStr instanceof Date) {
    return isValidDate(dateStr) ? dateStr : null;
  }

  if (typeof dateStr === "number") {
    if (dateStr > 1 && dateStr < 100000) {
      return excelSerialToDate(dateStr);
    }
    return null;
  }

  if (typeof dateStr !== "string") return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const ukFormats = [
    "d/M/yyyy H:mm:ss",
    "d/M/yyyy H:mm",
    "d/M/yyyy",
    "d-M-yyyy H:mm:ss",
    "d-M-yyyy H:mm",
    "d-M-yyyy",
  ];

  for (const format of ukFormats) {
    const parsed = dateFnsParse(trimmed, format, new Date());
    if (isValidDate(parsed)) return parsed;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numericValue = Number(trimmed);
    if (numericValue > 1 && numericValue < 100000) {
      return excelSerialToDate(Math.floor(numericValue));
    }
  }

  const isoParsed = new Date(trimmed);
  return isValidDate(isoParsed) ? isoParsed : null;
}

function getCol(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

async function parseFileData(filePath: string): Promise<Record<string, unknown>[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".xlsx") {
    const buffer = await fs.promises.readFile(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false, dateNF: "dd/mm/yyyy" }) as Record<string, unknown>[];
  }

  let csvText: string;
  const buffer = await fs.promises.readFile(filePath);

  try {
    csvText = buffer.toString("utf-8");
    Papa.parse(csvText, { header: true, preview: 1 });
  } catch {
    const iconv = await import("iconv-lite");
    csvText = iconv.decode(buffer, "ISO-8859-1");
  }

  if (csvText.charCodeAt(0) === 0xfeff) {
    csvText = csvText.slice(1);
  }

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return parsed.data as Record<string, unknown>[];
}

async function importJobsFromLiveFile(filePath: string) {
  const data = await parseFileData(filePath);

  if (data.length === 0) {
    throw new Error("No data rows found in live import file");
  }

  const firstRow = data[0];
  const columns = Object.keys(firstRow);
  const requiredColumns = ["JobID", "Account Code", "Site Name", "Portal Status"];
  const missingColumns = requiredColumns.filter((col) => !columns.includes(col));

  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const seenJobIds = new Set<string>();
  const errors: { row: number; message: string }[] = [];
  const jobsToInsert: Parameters<typeof storage.createJob>[0][] = [];
  const accountsToCreate = new Map<string, { code: string; name: string }>();

  const existingAccounts = await storage.getAllCustomerAccounts();
  const existingAccountCodes = new Set(existingAccounts.map((a) => a.accountCode));

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2;

    try {
      const jobId = getCol(row, "JobID", "job_id", "JobId");
      const accountCode = getCol(row, "Account Code", "account_code", "AccountCode", "Customer Alpha Code");
      const accountName = getCol(row, "Account Name", "account_name", "AccountName");
      const siteName = getCol(row, "Site Name", "site_name", "SiteName");
      const portalStatus = getCol(row, "Portal Status", "portal_status");
      const internalStatus = getCol(row, "Status", "status");
      const displayStatus = portalStatus || internalStatus;
      const jobType = getCol(row, "Job Type", "job_type", "JobType");
      const equipment = getCol(row, "Equipment", "equipment");
      const engineerName = getCol(row, "Allocated Engineer", "engineer_name", "Employee", "Engineer");
      const etaDate = getCol(row, "ETA", "Eta", "ETA Date", "eta_date");
      const statusText = displayStatus ? String(displayStatus).toLowerCase() : "";
      const visitDate = getCol(row, "Visit Date", "visit_date", "VisitDate", "Scheduled Date", "Engineer Visit Date") || (statusText.includes("pending engineer") ? etaDate : null);
      const partsDue = getCol(row, "Parts Due", "parts_due", "due_date", "Due", "DueDate", "Parts ETA", "Parts ETA Date") || (statusText.includes("awaiting parts") ? etaDate : null);
      const jobValue = getCol(row, "Total Job Value", "job_value_estimate", "JobValue", "Job Value");
      const postCode = getCol(row, "PostCode", "postcode", "post_code");

      if (!jobId || !accountCode || !siteName) {
        errors.push({ row: rowNum, message: "Missing required fields (JobID, Account Code, or Site Name)" });
        continue;
      }

      const jobIdStr = String(jobId).trim();
      if (seenJobIds.has(jobIdStr)) {
        continue;
      }
      seenJobIds.add(jobIdStr);

      const accountCodeStr = String(accountCode).trim();
      const accountNameStr = accountName ? String(accountName).trim() : accountCodeStr;

      if (!existingAccountCodes.has(accountCodeStr) && !accountsToCreate.has(accountCodeStr)) {
        accountsToCreate.set(accountCodeStr, { code: accountCodeStr, name: accountNameStr });
      }

      let shortDescription = jobType ? String(jobType).trim() : "No description";
      if (equipment) {
        shortDescription += ` - ${String(equipment).trim()}`;
      }

      const fullSiteName = postCode ? `${String(siteName).trim()} (${String(postCode).trim()})` : String(siteName).trim();

      jobsToInsert.push({
        jobId: jobIdStr,
        accountCode: accountCodeStr,
        siteName: fullSiteName,
        status: displayStatus ? String(displayStatus).trim() : "Unknown",
        createdDate: new Date(),
        lastUpdatedDate: new Date(),
        shortDescription,
        engineerName: engineerName ? String(engineerName).trim() : null,
        lastVisitDate: null,
        nextActionDueDate: null,
        priority: null,
        jobValueEstimate: jobValue ? String(jobValue).replace(/[^0-9.-]/g, "") : null,
        dueDate: parseFlexibleDate(partsDue),
        visitDate: parseFlexibleDate(visitDate),
        equipment: equipment ? String(equipment).trim() : null,
        importBatchId: null,
      });
    } catch (error) {
      errors.push({ row: rowNum, message: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  if (jobsToInsert.length === 0) {
    throw new Error("No valid jobs found in live import file");
  }

  if (accountsToCreate.size > 0) {
    const crypto = await import("crypto");
    for (const [code, account] of Array.from(accountsToCreate.entries())) {
      // Each new account gets a random temporary password and must reset it on first login.
      const tempPassword = `${crypto.randomBytes(18).toString("base64url")}!9`;
      const hashedPassword = await bcrypt.hash(tempPassword, 12);
      await storage.createCustomerAccount({
        accountCode: code,
        accountName: account.name,
        passwordHash: hashedPassword,
      });
      // Audit so the temp password is recoverable post-hoc only via the audit log
      // (admin must reset the password for the customer; the plaintext is intentionally not persisted).
      await storage.createAuditEvent({
        actorType: "system",
        actorId: "live-import",
        action: "account.auto_create",
        targetType: "customer_account",
        targetId: code,
        ip: null,
        userAgent: null,
        payload: JSON.stringify({ accountName: account.name, mustChangePassword: true }),
      }).catch(() => undefined);
    }
  }

  await storage.clearAllJobs();

  for (const job of jobsToInsert) {
    await storage.createJob(job);
  }

  await storage.setSystemSetting("last_import", new Date().toISOString());
  await storage.setSystemSetting("last_import_source", filePath);

  await storage.createImportBatch({
    importedBy: "auto-import",
    fileType: "jobs",
    fileName: path.basename(filePath),
    rowCount: jobsToInsert.length,
    errorCount: errors.length,
    errors: errors.length > 0 ? JSON.stringify(errors.slice(0, 50)) : null,
  });

  return {
    jobsImported: jobsToInsert.length,
    accountsCreated: accountsToCreate.size,
    duplicatesSkipped: data.length - jobsToInsert.length - errors.length,
    errorCount: errors.length,
  };
}

export function startLiveJobsAutoImport(log: (message: string, source?: string) => void) {
  if (!autoImportEnabled) {
    log("live jobs auto-import disabled by AUTO_IMPORT_ENABLED=false", "live-import");
    return;
  }

  const checkForUpdates = async (force = false) => {
    if (isImportRunning) return;

    try {
      if (!fs.existsSync(liveJobsPath)) {
        if (!hasLoggedMissingFile) {
          log(`live jobs file not found at ${liveJobsPath}`, "live-import");
          hasLoggedMissingFile = true;
        }
        return;
      }

      hasLoggedMissingFile = false;
      const stats = await fs.promises.stat(liveJobsPath);
      const signature = `${stats.mtimeMs}:${stats.size}`;

      if (!force && signature === lastSeenSignature) {
        return;
      }

      isImportRunning = true;
      const result = await importJobsFromLiveFile(liveJobsPath);
      lastSeenSignature = signature;
      log(`live jobs import complete: ${result.jobsImported} jobs, ${result.errorCount} errors`, "live-import");
    } catch (error) {
      log(`live jobs import failed: ${error instanceof Error ? error.message : "Unknown error"}`, "live-import");
    } finally {
      isImportRunning = false;
    }
  };

  log(`watching live jobs file at ${liveJobsPath}`, "live-import");
  void checkForUpdates(true);
  setInterval(() => {
    void checkForUpdates(false);
  }, autoImportIntervalMs);
}
