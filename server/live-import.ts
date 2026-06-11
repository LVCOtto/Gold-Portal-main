import fs from "fs";
import path from "path";
import { Readable } from "stream";
import bcrypt from "bcryptjs";
import { GetObjectCommand, HeadObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parse as dateFnsParse, isValid as isValidDate } from "date-fns";
import { storage } from "./storage";

const DEFAULT_LIVE_JOBS_PATH = "T:\\LVC General\\LVC Staff\\Otto\\Exports\\Job Live Status Hub.csv";
const liveJobsPath = process.env.AUTO_IMPORT_JOBS_PATH || DEFAULT_LIVE_JOBS_PATH;
const autoImportSource = (process.env.AUTO_IMPORT_SOURCE || (process.env.AUTO_IMPORT_R2_BUCKET ? "r2" : "file")).toLowerCase();
const autoImportEnabled = process.env.AUTO_IMPORT_ENABLED !== "false";
const autoImportIntervalMs = Math.max(Number.parseInt(process.env.AUTO_IMPORT_INTERVAL_MS || "60000", 10) || 60000, 15000);

const r2Endpoint = process.env.AUTO_IMPORT_R2_ENDPOINT;
const r2Bucket = process.env.AUTO_IMPORT_R2_BUCKET;
const r2Key = process.env.AUTO_IMPORT_R2_KEY;
const r2AccessKeyId = process.env.AUTO_IMPORT_R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.AUTO_IMPORT_R2_SECRET_ACCESS_KEY;
const r2Region = process.env.AUTO_IMPORT_R2_REGION || "auto";

let lastSeenSignature: string | null = null;
let isImportRunning = false;
let hasLoggedMissingFile = false;

function formatImportError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown error";
  }

  const detail = error as Error & {
    Code?: unknown;
    code?: unknown;
    $metadata?: {
      httpStatusCode?: number;
      requestId?: string;
      extendedRequestId?: string;
    };
  };
  const parts = [detail.name || "Error"];

  if (detail.message && detail.message !== detail.name) {
    parts.push(detail.message);
  }
  if (detail.Code) {
    parts.push(`code=${String(detail.Code)}`);
  } else if (detail.code) {
    parts.push(`code=${String(detail.code)}`);
  }
  if (detail.$metadata?.httpStatusCode) {
    parts.push(`status=${detail.$metadata.httpStatusCode}`);
  }
  if (detail.$metadata?.requestId) {
    parts.push(`requestId=${detail.$metadata.requestId}`);
  }
  if (detail.$metadata?.extendedRequestId) {
    parts.push(`extendedRequestId=${detail.$metadata.extendedRequestId}`);
  }

  return parts.join(" | ");
}

function createR2Client(): S3Client {
  if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey) {
    throw new Error("R2 import is missing endpoint or credentials");
  }

  return new S3Client({
    region: r2Region,
    endpoint: r2Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
}

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

function startOfDay(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function isPastDate(date: Date): boolean {
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
}

function selectAwaitingPartsDueDate(inferredEta: unknown, partsDue: unknown): Date | null {
  const inferredEtaDate = parseFlexibleDate(inferredEta);
  if (inferredEtaDate && !isPastDate(inferredEtaDate)) {
    return inferredEtaDate;
  }

  const partsDueDate = parseFlexibleDate(partsDue);
  if (partsDueDate && !isPastDate(partsDueDate)) {
    return partsDueDate;
  }

  return null;
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

async function responseBodyToBuffer(body: GetObjectCommandOutput["Body"]): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const transformBody = body as { transformToByteArray?: () => Promise<Uint8Array>; arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof transformBody.transformToByteArray === "function") {
    return Buffer.from(await transformBody.transformToByteArray());
  }
  if (typeof transformBody.arrayBuffer === "function") {
    return Buffer.from(await transformBody.arrayBuffer());
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported R2 response body");
}

function sourceFileName(sourceName: string): string {
  return path.basename(sourceName.replace(/\\/g, "/"));
}

async function parseBufferData(buffer: Buffer, sourceName: string): Promise<Record<string, unknown>[]> {
  const ext = path.extname(sourceName).toLowerCase();

  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false, dateNF: "dd/mm/yyyy" }) as Record<string, unknown>[];
  }

  let csvText: string;

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

async function parseFileData(filePath: string): Promise<Record<string, unknown>[]> {
  const buffer = await fs.promises.readFile(filePath);
  return parseBufferData(buffer, filePath);
}

async function fetchR2Object(client: S3Client): Promise<{ data: Record<string, unknown>[]; sourceName: string }> {
  if (!r2Bucket || !r2Key) {
    throw new Error("R2 import is missing bucket or object key");
  }

  const response = await client.send(new GetObjectCommand({ Bucket: r2Bucket, Key: r2Key }));
  const buffer = await responseBodyToBuffer(response.Body);
  return {
    data: await parseBufferData(buffer, r2Key),
    sourceName: `r2://${r2Bucket}/${r2Key}`,
  };
}

async function getR2Signature(client: S3Client): Promise<string> {
  if (!r2Bucket || !r2Key) {
    throw new Error("R2 import is missing bucket or object key");
  }

  const head = await client.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: r2Key }));
  return `${head.ETag || "no-etag"}:${head.LastModified?.getTime() || "no-mtime"}:${head.ContentLength || 0}`;
}

async function importJobsFromLiveData(data: Record<string, unknown>[], sourceName: string) {

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
        const inferredEta = getCol(row, "Inferred ETA", "inferred_eta", "ETA", "Eta", "ETA Date", "eta_date");
      const statusText = displayStatus ? String(displayStatus).toLowerCase() : "";
      const visitDate = parseFlexibleDate(getCol(row, "Visit Date", "visit_date", "VisitDate", "Scheduled Date", "Engineer Visit Date"));
      const partsDue = getCol(row, "Parts Due", "parts_due", "due_date", "Due", "DueDate", "Parts ETA", "Parts ETA Date");
      const dueDate = statusText.includes("awaiting parts")
        ? selectAwaitingPartsDueDate(inferredEta, partsDue)
        : parseFlexibleDate(partsDue);
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
        dueDate,
        visitDate,
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
  await storage.setSystemSetting("last_import_source", sourceName);

  await storage.createImportBatch({
    importedBy: "auto-import",
    fileType: "jobs",
    fileName: sourceFileName(sourceName),
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

async function importJobsFromLiveFile(filePath: string) {
  return importJobsFromLiveData(await parseFileData(filePath), filePath);
}

export function startLiveJobsAutoImport(log: (message: string, source?: string) => void) {
  if (!autoImportEnabled) {
    log("live jobs auto-import disabled by AUTO_IMPORT_ENABLED=false", "live-import");
    return;
  }

  if (autoImportSource === "r2") {
    const missing = [
      ["AUTO_IMPORT_R2_ENDPOINT", r2Endpoint],
      ["AUTO_IMPORT_R2_BUCKET", r2Bucket],
      ["AUTO_IMPORT_R2_KEY", r2Key],
      ["AUTO_IMPORT_R2_ACCESS_KEY_ID", r2AccessKeyId],
      ["AUTO_IMPORT_R2_SECRET_ACCESS_KEY", r2SecretAccessKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      log(`live jobs R2 auto-import not configured; missing ${missing.join(", ")}`, "live-import");
      return;
    }

    const client = createR2Client();
    const checkForUpdates = async (force = false) => {
      if (isImportRunning) return;

      try {
        const signature = await getR2Signature(client);

        if (!force && signature === lastSeenSignature) {
          return;
        }

        isImportRunning = true;
        const { data, sourceName } = await fetchR2Object(client);
        const result = await importJobsFromLiveData(data, sourceName);
        lastSeenSignature = signature;
        log(`live jobs R2 import complete: ${result.jobsImported} jobs, ${result.errorCount} errors`, "live-import");
      } catch (error) {
        log(`live jobs R2 import failed: ${formatImportError(error)}`, "live-import");
      } finally {
        isImportRunning = false;
      }
    };

    log(`watching live jobs R2 object ${r2Bucket}/${r2Key}`, "live-import");
    void checkForUpdates(true);
    setInterval(() => {
      void checkForUpdates(false);
    }, autoImportIntervalMs);
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
      log(`live jobs import failed: ${formatImportError(error)}`, "live-import");
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
