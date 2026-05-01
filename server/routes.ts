import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import multer from "multer";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { parse as dateFnsParse, isValid as isValidDate } from "date-fns";
import { storage } from "./storage";
import { pool } from "./db";

// Helper function to convert Excel serial date to JavaScript Date
function excelSerialToDate(serial: number): Date {
  // Excel's epoch is December 30, 1899
  // Excel incorrectly treats 1900 as a leap year (Lotus 1-2-3 bug)
  const excelEpoch = new Date(1899, 11, 30);
  const days = Math.floor(serial);
  const result = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
  return result;
}

// Helper function to parse dates in various formats (UK dd/MM/yyyy, ISO, Excel serial, etc.)
function parseFlexibleDate(dateStr: unknown): Date | null {
  if (dateStr === null || dateStr === undefined) return null;
  
  // Handle if it's already a Date object (from XLSX with cellDates: true)
  if (dateStr instanceof Date) {
    return isValidDate(dateStr) ? dateStr : null;
  }
  
  // Handle Excel serial numbers passed as numbers
  if (typeof dateStr === 'number') {
    if (dateStr > 1 && dateStr < 100000) { // Valid Excel date range
      return excelSerialToDate(dateStr);
    }
    return null;
  }
  
  if (typeof dateStr !== 'string') return null;
  
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

  // Check if the whole string is a numeric Excel serial date. Do this after UK
  // date parsing so values like "16/04/2026 00:00" are not mistaken for 16.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const numericValue = Number(trimmed);
    if (numericValue > 1 && numericValue < 100000) {
      return excelSerialToDate(Math.floor(numericValue));
    }
  }
  
  // Try ISO format
  const parsed = new Date(trimmed);
  if (isValidDate(parsed)) return parsed;
  
  return null;
}

// Extend session data type
declare module "express-session" {
  interface SessionData {
    user?: {
      type: "customer" | "admin";
      accountCode?: string;
      accountName?: string;
      mustChangePassword?: boolean;
    };
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB hard cap
    files: 1,
    fields: 20,
  },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const ok = name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
    if (!ok) {
      return cb(new Error("Only .csv, .xls, or .xlsx files are allowed"));
    }
    cb(null, true);
  },
});

// ---------- Per-account login lockout (in-memory, best-effort) ----------
const MAX_LOGIN_FAILS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function lockoutKey(scope: "customer" | "admin", id: string): string {
  return `${scope}:${id.toLowerCase()}`;
}

function isLockedOut(key: string): number {
  const entry = loginAttempts.get(key);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  if (entry.lockedUntil !== 0 && entry.lockedUntil <= Date.now()) loginAttempts.delete(key);
  return 0;
}

function recordFailure(key: string) {
  const entry = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_FAILS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

function clearFailures(key: string) {
  loginAttempts.delete(key);
}

function safeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still consume time on a same-length comparison to avoid timing leaks.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

function generateTempPassword(): string {
  // 18 random bytes → 24 url-safe chars. Mix in a digit/symbol guarantee for policy compliance.
  const base = crypto.randomBytes(18).toString("base64url");
  return `${base}!9`;
}

function clientIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  let ip = fwd || req.socket.remoteAddress || "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  return ip;
}

async function audit(
  req: Request,
  action: string,
  opts: { actorType?: "admin" | "customer" | "system"; actorId?: string | null; targetType?: string | null; targetId?: string | null; payload?: unknown } = {},
) {
  try {
    const sessUser = req.session?.user;
    const actorType = opts.actorType || sessUser?.type || "system";
    const actorId = opts.actorId ?? (sessUser?.type === "customer" ? sessUser.accountCode : sessUser?.type === "admin" ? "admin" : null);
    await storage.createAuditEvent({
      actorType,
      actorId: actorId ?? null,
      action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      ip: clientIp(req),
      userAgent: (req.headers["user-agent"] as string | undefined) || null,
      payload: opts.payload === undefined ? null : JSON.stringify(opts.payload),
    });
  } catch (err) {
    console.error("audit log failure:", err);
  }
}

// ---------- CSRF defense: require a custom header on mutating requests ----------
function normalizeOrigin(input: string | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(req: Request): string {
  const host = req.get("host") || "";
  const protoHeader = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
  const proto = String(protoHeader).split(",")[0].trim() || req.protocol || "http";
  return `${proto}://${host}`;
}

function requireSameOriginHeader(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  // Login endpoints are exempt (no cookie yet, and require credentials anyway).
  // Upload endpoints are also exempt; they're protected by requireAuth("admin") already.
  const exempt = [
    "/api/auth/customer/login",
    "/api/auth/admin/login",
    "/api/health",
    "/api/admin/imports",
    "/api/admin/import-replace",
  ];
  const requestPath = req.originalUrl.split("?")[0];
  if (exempt.some((p) => requestPath === p || requestPath.startsWith(p + "/"))) return next();

  const headerOk = req.headers["x-requested-by"] === "lvc-portal";
  const expectedOrigin = getRequestOrigin(req);
  const requestOrigin = normalizeOrigin(req.get("origin") || undefined);
  const refererOrigin = normalizeOrigin(req.get("referer") || undefined);
  const originOk = requestOrigin === expectedOrigin || refererOrigin === expectedOrigin;
  const secFetchSite = (req.get("sec-fetch-site") || "").toLowerCase();
  const fetchSiteOk = secFetchSite === "same-origin" || secFetchSite === "same-site" || secFetchSite === "none";

  if (!headerOk && !originOk && !fetchSiteOk) {
    return res.status(403).json({ message: "Invalid request origin" });
  }
  next();
}

// Helper function to compute the customer-facing ETA/date based on status.
// Shows parts date for "Awaiting Parts" jobs, visit date for "Pending Engineer" jobs.
// Supports date override that persists until job status changes
function computeUpcomingDate(
  job: { dueDate?: Date | null; visitDate?: Date | null; status?: string | null },
  override?: { dateOverride?: Date | null; statusAtOverride?: string | null } | null
): { date: Date; type: 'parts' | 'visit' } | null {
  const status = (job.status || '').toLowerCase();
  const isAwaitingParts = status.includes('awaiting parts');
  const isPendingVisit = status.includes('pending engineer') || status.includes('engineer visit');
  
  // Check for date override - only use if status hasn't changed
  if (override?.dateOverride && override?.statusAtOverride) {
    const overrideStatus = override.statusAtOverride.toLowerCase();
    const currentStatus = status;
    // If status matches, use the override date
    if (overrideStatus === currentStatus) {
      const overrideDate = new Date(override.dateOverride);
      // Determine type based on current status
      const type = isAwaitingParts ? 'parts' : 'visit';
      return { date: overrideDate, type };
    }
    // Status changed - override is ignored, fall through to normal logic
  }
  
  // Only show parts date if status is "Awaiting Parts"
  if (isAwaitingParts && job.dueDate) {
    return { date: new Date(job.dueDate), type: 'parts' };
  }
  
  // Only show visit date if status is "Pending Engineer Visit"
  if (isPendingVisit && job.visitDate) {
    return { date: new Date(job.visitDate), type: 'visit' };
  }
  
  return null;
}

// Middleware to check if user is authenticated
function requireAuth(type?: "customer" | "admin") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (type && req.session.user.type !== type) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

// Get account code from session (for customer routes)
function getAccountCode(req: Request): string | null {
  return req.session.user?.type === "customer" ? req.session.user.accountCode ?? null : null;
}

async function getScopedAccountCode(req: Request, res: Response): Promise<string | null> {
  const sessionUser = req.session.user;
  if (sessionUser?.type === "customer") {
    if (!sessionUser.accountCode) {
      res.status(400).json({ message: "Account code required" });
      return null;
    }
    return sessionUser.accountCode;
  }

  if (sessionUser?.type === "admin") {
    const requestedAccountCode = typeof req.query.accountCode === "string" ? req.query.accountCode.trim() : "";
    if (!requestedAccountCode) {
      res.status(400).json({ message: "Account code required" });
      return null;
    }

    const account = await storage.getCustomerAccountByCode(requestedAccountCode);
    if (!account) {
      res.status(404).json({ message: "Account not found" });
      return null;
    }

    return account.accountCode;
  }

  res.status(401).json({ message: "Unauthorized" });
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session setup
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error(
      "SESSION_SECRET environment variable must be set and at least 32 characters long",
    );
  }
  const PgSession = connectPgSimple(session);
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      name: "lvc.sid",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "strict",
        maxAge: 12 * 60 * 60 * 1000, // 12 hour rolling window
      },
    })
  );

  // CSRF: require a custom header on all mutating API calls. Browsers will not
  // attach this header on cross-site requests, blocking classic CSRF.
  app.use("/api", requireSameOriginHeader);

  // Block customers with mustChangePassword=true from reaching any route except
  // the password-change/logout/me endpoints. Belt-and-braces server-side enforcement.
  app.use("/api", (req, res, next) => {
    const u = req.session.user;
    if (!u || u.type !== "customer" || !u.mustChangePassword) return next();
    const requestPath = `${req.baseUrl}${req.path}`;
    const allowedPaths = new Set([
      "/api/auth/me",
      "/api/auth/logout",
      "/api/auth/change-password",
      "/api/health",
    ]);
    if (allowedPaths.has(requestPath)) return next();
    return res.status(403).json({ message: "PASSWORD_CHANGE_REQUIRED" });
  });

  // ==================== RATE LIMITING ====================
  
  // Rate limiter for login attempts - 5 attempts per 15 minutes per IP
  const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { message: "Too many login attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed attempts
  });

  // General API rate limiter - 100 requests per minute
  const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { message: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply general rate limiting to all API routes
  app.use("/api/", apiRateLimiter);

  // ==================== HEALTH CHECK ====================
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ==================== AUTH ROUTES ====================
  
  // Check current auth status
  app.get("/api/auth/me", (req, res) => {
    if (req.session.user) {
      res.json({ user: req.session.user });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // Customer login (with rate limiting + per-account lockout)
  app.post("/api/auth/customer/login", loginRateLimiter, async (req, res) => {
    try {
      const { accountCode, password } = req.body || {};

      if (typeof accountCode !== "string" || typeof password !== "string" || !accountCode || !password) {
        return res.status(400).json({ message: "Account code and password are required" });
      }
      const normalizedAccountCode = accountCode.trim();
      if (!normalizedAccountCode || normalizedAccountCode.length > 64 || password.length > 256) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const key = lockoutKey("customer", normalizedAccountCode);
      const lockedFor = isLockedOut(key);
      if (lockedFor > 0) {
        return res.status(429).json({ message: `Account temporarily locked. Try again in ${Math.ceil(lockedFor / 60000)} minute(s).` });
      }

      const account = await storage.getCustomerAccountByCode(normalizedAccountCode);
      // Always run bcrypt to keep timing roughly constant whether or not the account exists.
      const dummyHash = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.OE8xvRgHJ3kQ8h2k5OKqQF7j2/X.";
      const valid = await bcrypt.compare(password, account?.passwordHash || dummyHash);
      if (!account || !valid) {
        recordFailure(key);
        await audit(req, "login.failure", { actorType: "customer", actorId: normalizedAccountCode });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      clearFailures(key);
      req.session.user = {
        type: "customer",
        accountCode: account.accountCode,
        accountName: account.accountName,
        mustChangePassword: !!account.mustChangePassword,
      };
      await storage.updateCustomerLastLogin(account.accountCode);
      await audit(req, "login.success", { actorType: "customer", actorId: account.accountCode });

      res.json({
        user: req.session.user,
        mustChangePassword: !!account.mustChangePassword,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin login (with rate limiting and IP allowlist)
  app.post("/api/auth/admin/login", loginRateLimiter, async (req, res) => {
    try {
      const { password } = req.body || {};
      const adminPassword = process.env.ADMIN_PASSWORD;
      const allowedIPs = process.env.ADMIN_ALLOWED_IPS;
      const ip = clientIp(req);

      if (typeof password !== "string" || !password || password.length > 256) {
        return res.status(400).json({ message: "Password required" });
      }

      // Check IP allowlist if configured
      if (allowedIPs) {
        const ipList = allowedIPs.split(',').map(p => p.trim());
        const isAllowed = ipList.includes('*') ||
                          ipList.includes(ip) ||
                          ipList.includes(`::ffff:${ip}`) ||
                          ipList.some(p => p.startsWith('::ffff:') && p.substring(7) === ip);
        if (!isAllowed) {
          await audit(req, "admin.login.blocked_ip", { actorType: "admin", actorId: "admin" });
          return res.status(403).json({ message: "Access denied from this location" });
        }
      }

      if (!adminPassword || adminPassword.length < 16) {
        return res.status(500).json({ message: "Admin password not configured" });
      }

      const key = lockoutKey("admin", "admin");
      const lockedFor = isLockedOut(key);
      if (lockedFor > 0) {
        return res.status(429).json({ message: `Admin login locked. Try again in ${Math.ceil(lockedFor / 60000)} minute(s).` });
      }

      if (!safeStringEqual(password, adminPassword)) {
        recordFailure(key);
        await audit(req, "admin.login.failure", { actorType: "admin", actorId: "admin" });
        return res.status(401).json({ message: "Invalid password" });
      }

      clearFailures(key);
      req.session.user = { type: "admin" };
      await audit(req, "admin.login.success", { actorType: "admin", actorId: "admin" });
      res.json({ user: req.session.user });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    const sessUser = req.session.user;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("lvc.sid");
      // Best-effort fire-and-forget audit (session is gone, audit() will record actor as system).
      if (sessUser) {
        storage.createAuditEvent({
          actorType: sessUser.type,
          actorId: sessUser.type === "customer" ? sessUser.accountCode || null : "admin",
          action: "logout",
          targetType: null,
          targetId: null,
          ip: clientIp(req),
          userAgent: (req.headers["user-agent"] as string | undefined) || null,
          payload: null,
        }).catch(() => undefined);
      }
      res.json({ message: "Logged out" });
    });
  });

  // Customer change password (also clears mustChangePassword flag)
  app.post("/api/auth/change-password", requireAuth("customer"), async (req, res) => {
    try {
      const accountCode = getAccountCode(req);
      if (!accountCode) return res.status(400).json({ message: "Account code required" });

      const schema = z.object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z
          .string()
          .min(12, "New password must be at least 12 characters")
          .max(256)
          .refine((p) => /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p), {
            message: "Password must contain upper, lower, and number",
          }),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const { currentPassword, newPassword } = parsed.data;

      const account = await storage.getCustomerAccountByCode(accountCode);
      if (!account) return res.status(404).json({ message: "Account not found" });

      const valid = await bcrypt.compare(currentPassword, account.passwordHash);
      if (!valid) {
        await audit(req, "password.change.failure", { actorType: "customer", actorId: accountCode });
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({ message: "New password must differ from current" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await storage.updateCustomerAccountPassword(accountCode, passwordHash);
      await storage.setMustChangePassword(accountCode, false);
      if (req.session.user) req.session.user.mustChangePassword = false;
      await audit(req, "password.change.success", { actorType: "customer", actorId: accountCode });

      res.json({ message: "Password updated" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== SYSTEM ROUTES ====================
  
  app.get("/api/system/last-import", async (req, res) => {
    try {
      const lastImport = await storage.getSystemSetting("last_import");
      res.json({ lastImport });
    } catch (error) {
      console.error("Error getting last import:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== CUSTOMER DASHBOARD ROUTES ====================
  
  app.get("/api/dashboard/stats", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }

      const stats = await storage.getDashboardStats(accountCode);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== JOBS ROUTES ====================
  
  app.get("/api/jobs", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }

      const { page, search, status, limit, sortBy, sortOrder } = req.query;
      const result = await storage.getJobs({
        accountCode,
        search: search as string,
        status: status as string,
        page: page ? parseInt(page as string) : 1,
        pageSize: limit ? parseInt(limit as string) : 10,
        sortBy: sortBy as string,
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      });

      // Get overrides for jobs and attach customer-visible data
      const overrides = await storage.getJobOverrides();
      const overrideMap = new Map(overrides.map(o => [o.jobId, o]));
      
      const jobsWithOverrides = result.jobs.map(job => {
        const override = overrideMap.get(job.jobId);
        const upcoming = computeUpcomingDate(job, override);
        return {
          ...job,
          displayStatus: override?.displayStatus || null,
          adminNotes: override?.adminNotes || null,
          upcomingDate: upcoming?.date || null,
          upcomingDateType: upcoming?.type || null,
        };
      });

      res.json({ ...result, jobs: jobsWithOverrides, page: page ? parseInt(page as string) : 1, pageSize: limit ? parseInt(limit as string) : 10 });
    } catch (error) {
      console.error("Jobs fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/jobs/:jobId", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }
      const { jobId } = req.params;

      const job = await storage.getJobByJobId(jobId, accountCode);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Get override for customer-visible data
      const override = await storage.getJobOverride(jobId);
      const upcoming = computeUpcomingDate(job, override);

      const quotes = await storage.getQuotesByJobId(jobId, accountCode);
      const purchaseOrders = await storage.getPurchaseOrdersByJobId(jobId, accountCode);

      res.json({ 
        job: {
          ...job,
          displayStatus: override?.displayStatus || null,
          adminNotes: override?.adminNotes || null,
          upcomingDate: upcoming?.date || null,
          upcomingDateType: upcoming?.type || null,
        }, 
        quotes, 
        purchaseOrders 
      });
    } catch (error) {
      console.error("Job detail error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== QUOTES ROUTES ====================
  
  app.get("/api/quotes", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }

      const { page, search, status } = req.query;
      const result = await storage.getQuotes({
        accountCode,
        search: search as string,
        status: status as string,
        page: page ? parseInt(page as string) : 1,
        pageSize: 10,
      });

      res.json({ ...result, page: page ? parseInt(page as string) : 1, pageSize: 10 });
    } catch (error) {
      console.error("Quotes fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/quotes/:quoteId", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }
      const { quoteId } = req.params;

      const quote = await storage.getQuoteByQuoteId(quoteId, accountCode);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }

      const approvalEvents = await storage.getApprovalEventsByQuoteId(quoteId);

      res.json({ quote, approvalEvents });
    } catch (error) {
      console.error("Quote detail error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/quotes/:quoteId/approve", requireAuth("customer"), async (req, res) => {
    try {
      const accountCode = getAccountCode(req);
      if (!accountCode) return res.status(400).json({ message: "Account code required" });
      const accountName = req.session.user?.accountName || accountCode;
      const { quoteId } = req.params;

      const schema = z.object({
        contactName: z.string().trim().min(1).max(120).optional(),
        contactEmail: z.string().trim().email().max(254).optional(),
        customerPoNumber: z.string().trim().max(64).optional(),
        termsAccepted: z.literal(true),
        // Legacy keys still accepted as metadata only — NOT used as binding identity.
        approverName: z.string().trim().max(120).optional(),
        approverEmail: z.string().trim().email().max(254).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Approval input invalid", issues: parsed.error.issues });
      }
      const { contactName, contactEmail, customerPoNumber, approverName: bodyApproverName, approverEmail: bodyApproverEmail } = parsed.data;

      const quote = await storage.getQuoteByQuoteId(quoteId, accountCode);
      if (!quote) {
        return res.status(404).json({ message: "Quote not found" });
      }
      if (quote.accountCode !== accountCode) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Binding identity is the authenticated account. Customer-typed contact info
      // is recorded as metadata in the payload but does not override session identity.
      await storage.createApprovalEvent({
        quoteId,
        jobId: quote.jobId,
        accountCode: quote.accountCode,
        approverName: accountName,
        approverEmail: contactEmail || bodyApproverEmail || `noreply+${accountCode}@account.local`,
        customerPoNumber: customerPoNumber || null,
        termsAccepted: true,
        payload: JSON.stringify({
          approvedAt: new Date().toISOString(),
          accountCode,
          contactName: contactName || bodyApproverName || null,
          contactEmail: contactEmail || bodyApproverEmail || null,
          ip: clientIp(req),
          userAgent: (req.headers["user-agent"] as string | undefined) || null,
        }),
      });

      await storage.updateQuoteStatus(quoteId, "approved_pending_internal_processing");
      await audit(req, "quote.approve", {
        actorType: "customer",
        actorId: accountCode,
        targetType: "quote",
        targetId: quoteId,
        payload: { customerPoNumber: customerPoNumber || null },
      });

      res.json({ message: "Approval recorded successfully" });
    } catch (error) {
      console.error("Quote approval error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== CUSTOMER EXPORT ROUTES ====================
  
  // Export all jobs as CSV
  app.get("/api/export/jobs", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }

      const { sortBy, sortOrder } = req.query;

      // Get all jobs for this account (no pagination)
      const result = await storage.getJobs({
        accountCode,
        page: 1,
        pageSize: 10000, // Get all
        sortBy: sortBy as string,
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      });

      // Get overrides
      const overrides = await storage.getJobOverrides();
      const overrideMap = new Map(overrides.map(o => [o.jobId, o]));

      // Build CSV data
      const csvData = result.jobs.map(job => {
        const override = overrideMap.get(job.jobId);
        const displayStatus = override?.displayStatus || job.status;
        return {
          "Job ID": job.jobId,
          "Site Name": job.siteName,
          "Description": job.shortDescription,
          "Status": displayStatus,
          "Engineer": job.engineerName || "",
          "Visit Date": job.visitDate ? new Date(job.visitDate).toLocaleDateString("en-GB") : "",
          "Due Date": job.dueDate ? new Date(job.dueDate).toLocaleDateString("en-GB") : "",
          "Value": job.jobValueEstimate || "",
          "Last Updated": job.lastUpdatedDate ? new Date(job.lastUpdatedDate).toLocaleDateString("en-GB") : "",
        };
      });

      const csv = Papa.unparse(csvData);
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="jobs-${accountCode}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Export jobs error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export jobs as PDF report
  app.get("/api/export/jobs/pdf", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }

      const { sortBy, sortOrder } = req.query;

      // Get account info
      const account = await storage.getCustomerAccountByCode(accountCode);
      const accountName = account?.accountName || accountCode;

      // Get all jobs for this account with customer's sort preference
      const result = await storage.getJobs({
        accountCode,
        page: 1,
        pageSize: 10000,
        sortBy: sortBy as string,
        sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      });

      // Get overrides
      const overrides = await storage.getJobOverrides();
      const overrideMap = new Map(overrides.map(o => [o.jobId, o]));

      // Compute stats (active jobs only - exclude closed)
      const activeJobs = result.jobs.filter(j => !j.status?.toLowerCase().includes('closed'));
      const openJobs = activeJobs.length;
      const awaitingApproval = result.jobs.filter(j => j.status?.toLowerCase().includes('quoted')).length;
      const awaitingParts = activeJobs.filter(j => j.status?.toLowerCase().includes('awaiting parts')).length;
      const pendingVisit = activeJobs.filter(j => j.status?.toLowerCase().includes('pending engineer')).length;

      // Create PDF
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="jobs-report-${accountCode}-${new Date().toISOString().split('T')[0]}.pdf"`);
      
      doc.pipe(res);

      // Brand colors
      const primaryBlue = '#1863DC';
      const accentRed = '#E30613';

      // Header with logo (left side)
      const logoPath = path.join(process.cwd(), 'attached_assets', 'logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 40, { width: 100 });
      } else {
        doc.fillColor(primaryBlue).fontSize(20).font('Helvetica-Bold').text('LVC UK', 50, 50);
      }

      // Report title (right side, positioned to avoid overlap)
      doc.fillColor('#333333').fontSize(18).font('Helvetica-Bold').text('Jobs Report', 350, 45, { width: 195, align: 'right' });
      doc.fillColor('#666666').fontSize(10).font('Helvetica').text(new Date().toLocaleDateString('en-GB', { 
        day: 'numeric', month: 'long', year: 'numeric' 
      }), 350, 68, { width: 195, align: 'right' });

      // Customer info section (start well below header/logo)
      doc.y = 150;
      doc.fillColor(primaryBlue).fontSize(14).font('Helvetica-Bold').text(accountName, 50);
      doc.fillColor('#666666').fontSize(10).font('Helvetica').text(`Account Code: ${accountCode}`);
      
      // Summary section
      doc.moveDown(1);
      doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text('Summary');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E0E0E0').stroke();
      doc.moveDown(0.5);

      // Stats boxes (active jobs only)
      const statsY = doc.y;
      doc.fillColor(primaryBlue).fontSize(24).font('Helvetica-Bold').text(String(openJobs), 50, statsY);
      doc.fillColor('#666666').fontSize(9).font('Helvetica').text('Active Jobs', 50, statsY + 25);

      doc.fillColor('#888888').fontSize(24).font('Helvetica-Bold').text(String(awaitingApproval), 150, statsY);
      doc.fillColor('#666666').fontSize(9).font('Helvetica').text('Awaiting Approval', 150, statsY + 25);

      doc.fillColor(accentRed).fontSize(24).font('Helvetica-Bold').text(String(awaitingParts), 280, statsY);
      doc.fillColor('#666666').fontSize(9).font('Helvetica').text('Awaiting Parts', 280, statsY + 25);

      // Jobs list section
      doc.moveDown(3);
      doc.fillColor('#333333').fontSize(12).font('Helvetica-Bold').text('Jobs Detail', 50);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E0E0E0').stroke();
      doc.moveDown(0.8);

      // Card-style job entries for better readability
      let jobCount = 0;
      const maxJobs = 25; // Limit for PDF length
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      for (const job of activeJobs) {
        if (jobCount >= maxJobs) break;

        // Check if we need a new page (each card ~90px height)
        if (doc.y > 670) {
          doc.addPage();
          doc.y = 50;
        }

        const override = overrideMap.get(job.jobId);
        const displayStatus = override?.displayStatus || job.status || 'Unknown';
        const adminNotes = override?.adminNotes || '';
        
        // Compute ETA using same logic as main jobs list
        let etaInfo = '';
        const upcoming = computeUpcomingDate(job, override);
        
        if (upcoming) {
          const isAwaitingParts = displayStatus.toLowerCase().includes('awaiting parts');
          if (isAwaitingParts) {
            // Show as window: start date to +3 working days
            const startDate = upcoming.date;
            let endDate = new Date(startDate);
            let workingDaysAdded = 0;
            while (workingDaysAdded < 3) {
              endDate.setDate(endDate.getDate() + 1);
              const dayOfWeek = endDate.getDay();
              if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
                workingDaysAdded++;
              }
            }
            const startStr = startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const endStr = endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            etaInfo = `Parts ETA at LVC: ${startStr} - ${endStr}`;
          } else {
            // Single date for visits
            const dateStr = upcoming.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            etaInfo = upcoming.type === 'parts' ? `Parts Due: ${dateStr}` : `Scheduled Visit: ${dateStr}`;
          }
        }

        const startY = doc.y;

        // Job header row: ID and Status
        doc.fillColor(primaryBlue).fontSize(11).font('Helvetica-Bold').text(`Job #${job.jobId}`, 50, startY);
        const statusColor = displayStatus.toLowerCase().includes('awaiting') ? accentRed : '#666666';
        doc.fillColor(statusColor).fontSize(9).font('Helvetica').text(displayStatus, 350, startY, { width: 195, align: 'right' });

        // Site name (full)
        doc.fillColor('#333333').fontSize(9).font('Helvetica').text(job.siteName || 'Unknown Site', 50, startY + 14, { width: 495 });

        // Engineer and description row
        let detailsY = startY + 28;
        doc.fillColor('#888888').fontSize(8).font('Helvetica');
        
        const details: string[] = [];
        if (job.engineerName) details.push(`Engineer: ${job.engineerName}`);
        if (job.shortDescription) details.push(job.shortDescription);
        
        if (details.length > 0) {
          doc.text(details.join('  |  '), 50, detailsY, { width: 495 });
          detailsY += 12;
        }

        // ETA info row (prominent display)
        if (etaInfo) {
          doc.fillColor(primaryBlue).fontSize(8).font('Helvetica-Bold').text(etaInfo, 50, detailsY, { width: 495 });
          detailsY += 12;
        }

        // Equipment if present
        if (job.equipment) {
          doc.fillColor('#666666').fontSize(8).font('Helvetica-Oblique').text(`Listed Equipment: ${job.equipment}`, 50, detailsY, { width: 495 });
          detailsY += 12;
        }

        // Admin note if present
        if (adminNotes) {
          doc.fillColor(primaryBlue).fontSize(8).font('Helvetica-Oblique').text(`Update from LVC: ${adminNotes}`, 50, detailsY, { width: 495 });
          detailsY += 12;
        }

        // Separator line
        doc.moveTo(50, detailsY + 4).lineTo(545, detailsY + 4).strokeColor('#EEEEEE').stroke();
        doc.y = detailsY + 14;
        
        jobCount++;
      }

      if (activeJobs.length > maxJobs) {
        doc.moveDown(0.5);
        doc.fillColor('#666666').fontSize(9).font('Helvetica-Oblique').text(`Showing ${maxJobs} of ${activeJobs.length} active jobs. Export CSV for complete data.`, 50);
      }

      // Footer
      const bottomY = 780;
      doc.fillColor('#999999').fontSize(8).font('Helvetica');
      doc.text('LVC UK Ltd | www.lvcuk.com | service@lvcuk.com', 50, bottomY, { align: 'center' });

      doc.end();
    } catch (error) {
      console.error("Export PDF error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export all quotes as CSV
  app.get("/api/export/quotes", requireAuth(), async (req, res) => {
    try {
      const accountCode = await getScopedAccountCode(req, res);
      if (!accountCode) {
        return;
      }

      // Get all quotes for this account (no pagination)
      const result = await storage.getQuotes({
        accountCode,
        page: 1,
        pageSize: 10000, // Get all
      });

      // Build CSV data
      const csvData = result.quotes.map(quote => ({
        "Quote ID": quote.quoteId,
        "Job ID": quote.jobId || "",
        "Status": quote.quoteStatus,
        "Date": quote.quoteDate ? new Date(quote.quoteDate).toLocaleDateString("en-GB") : "",
        "Net Total": quote.netTotal || 0,
        "VAT": quote.vatTotal || 0,
        "Gross Total": quote.grossTotal || 0,
        "Lead Time": quote.leadTimeText || "",
        "Summary": quote.quoteTextSummary || "",
      }));

      const csv = Papa.unparse(csvData);
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="quotes-${accountCode}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Export quotes error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== ADMIN ROUTES ====================
  
  app.get("/api/admin/stats", requireAuth("admin"), async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin audit log
  app.get("/api/admin/audit", requireAuth("admin"), async (req, res) => {
    try {
      const { actorType, actorId, action, page, pageSize } = req.query;
      const result = await storage.getAuditEvents({
        actorType: actorType ? String(actorType) : undefined,
        actorId: actorId ? String(actorId) : undefined,
        action: action ? String(action) : undefined,
        page: page ? parseInt(String(page), 10) : 1,
        pageSize: pageSize ? parseInt(String(pageSize), 10) : 50,
      });
      res.json(result);
    } catch (error) {
      console.error("Audit fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Accounts
  app.get("/api/admin/accounts", requireAuth("admin"), async (req, res) => {
    try {
      const { search } = req.query;
      const accounts = await storage.getAllCustomerAccounts(search as string);
      const safeAccounts = accounts.map(({ passwordHash, ...account }) => account);
      res.json(safeAccounts);
    } catch (error) {
      console.error("Accounts fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/accounts/:accountCode/password", requireAuth("admin"), async (req, res) => {
    try {
      const accountCode = req.params.accountCode.trim();
      const { password } = req.body || {};

      if (typeof password !== "string" || password.length < 12 || password.length > 256) {
        return res.status(400).json({ message: "Password must be 12-256 characters" });
      }
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({ message: "Password must contain upper, lower, and number" });
      }

      const account = await storage.getCustomerAccountByCode(accountCode);
      if (!account) {
        return res.status(404).json({ message: "Customer account not found" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await storage.updateCustomerAccountPassword(account.accountCode, passwordHash);
      await storage.setMustChangePassword(account.accountCode, true);
      await audit(req, "admin.account.password_reset", {
        targetType: "customer_account",
        targetId: account.accountCode,
      });

      res.json({ message: "Password updated", accountCode: account.accountCode, mustChangePassword: true });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Approvals
  app.get("/api/admin/approvals", requireAuth("admin"), async (req, res) => {
    try {
      const { page, search } = req.query;
      const result = await storage.getApprovalEvents({
        search: search as string,
        page: page ? parseInt(page as string) : 1,
        pageSize: 10,
      });

      res.json({ ...result, page: page ? parseInt(page as string) : 1, pageSize: 10 });
    } catch (error) {
      console.error("Approvals fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/approvals/export", requireAuth("admin"), async (req, res) => {
    try {
      const { search } = req.query;
      const approvals = await storage.getAllApprovalEvents(search as string);

      const csv = Papa.unparse(approvals.map(a => ({
        quote_id: a.quoteId,
        job_id: a.jobId || "",
        account_code: a.accountCode,
        approver_name: a.approverName,
        approver_email: a.approverEmail,
        customer_po_number: a.customerPoNumber || "",
        captured_at: a.capturedAt,
      })));

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=approvals.csv");
      res.send(csv);
    } catch (error) {
      console.error("Approvals export error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Job Overrides
  app.get("/api/admin/jobs", requireAuth("admin"), async (req, res) => {
    try {
      const { page, search, status, accountCode, limit } = req.query;
      const pageSize = limit ? parseInt(limit as string) : 20;
      const result = await storage.getJobs({
        accountCode: accountCode as string,
        search: search as string,
        status: status as string,
        page: page ? parseInt(page as string) : 1,
        pageSize,
      });
      
      // Get overrides for all jobs
      const overrides = await storage.getJobOverrides();
      const overrideMap = new Map(overrides.map(o => [o.jobId, o]));
      
      // Add overrides and compute upcoming dates
      const jobsWithExtras = result.jobs.map(job => {
        const override = overrideMap.get(job.jobId);
        const upcoming = computeUpcomingDate(job, override);
        return {
          ...job,
          override: override || null,
          displayStatus: override?.displayStatus || null,
          adminNotes: override?.adminNotes || null,
          upcomingDate: upcoming?.date || null,
          upcomingDateType: upcoming?.type || null,
        };
      });

      res.json({ ...result, jobs: jobsWithExtras, page: page ? parseInt(page as string) : 1, pageSize });
    } catch (error) {
      console.error("Admin jobs fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single account by code (for admin customer view)
  app.get("/api/admin/accounts/:accountCode", requireAuth("admin"), async (req, res) => {
    try {
      const { accountCode } = req.params;
      const account = await storage.getCustomerAccountByCode(accountCode);
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }
      const { passwordHash, ...safeAccount } = account;
      res.json(safeAccount);
    } catch (error) {
      console.error("Account fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/overrides", requireAuth("admin"), async (req, res) => {
    try {
      const overrides = await storage.getJobOverrides();
      res.json(overrides);
    } catch (error) {
      console.error("Overrides fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/overrides/:jobId", requireAuth("admin"), async (req, res) => {
    try {
      const { jobId } = req.params;
      const override = await storage.getJobOverride(jobId);
      res.json(override || null);
    } catch (error) {
      console.error("Override fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/overrides", requireAuth("admin"), async (req, res) => {
    try {
      const { jobId, displayStatus, adminNotes, internalNotes, dateOverride } = req.body;

      if (!jobId) {
        return res.status(400).json({ message: "Job ID is required" });
      }

      // Get the current job status to store as statusAtOverride
      const job = await storage.getJobByJobId(jobId);
      const currentStatus = job?.status || null;

      const override = await storage.upsertJobOverride({
        jobId,
        displayStatus: displayStatus || null,
        adminNotes: adminNotes || null,
        internalNotes: internalNotes || null,
        dateOverride: dateOverride ? new Date(dateOverride) : null,
        statusAtOverride: dateOverride ? currentStatus : null,
        updatedBy: "admin",
      });

      res.json(override);
    } catch (error) {
      console.error("Override creation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/overrides/:jobId", requireAuth("admin"), async (req, res) => {
    try {
      const { jobId } = req.params;
      await storage.deleteJobOverride(jobId);
      res.json({ message: "Override removed" });
    } catch (error) {
      console.error("Override deletion error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Imports
  app.get("/api/admin/imports", requireAuth("admin"), async (req, res) => {
    try {
      const batches = await storage.getImportBatches();
      res.json(batches);
    } catch (error) {
      console.error("Imports fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/imports", requireAuth("admin"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { type } = req.body;
      if (!type || !["jobs", "quotes", "purchase_orders"].includes(type)) {
        return res.status(400).json({ message: "Invalid import type" });
      }

      let data: Record<string, unknown>[] = [];
      const fileName = req.file.originalname;

      // Parse file
      if (fileName.endsWith(".csv")) {
        const csvText = req.file.buffer.toString("utf-8");
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        data = parsed.data as Record<string, unknown>[];
      } else if (fileName.endsWith(".xlsx")) {
        const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false, dateNF: 'dd/mm/yyyy' });
      } else {
        return res.status(400).json({ message: "Unsupported file format" });
      }

      const errors: { row: number; message: string }[] = [];
      let successCount = 0;

      // Create import batch first
      const batch = await storage.createImportBatch({
        importedBy: "admin",
        fileType: type,
        fileName,
        rowCount: data.length,
        errorCount: 0,
        errors: null,
      });

      // Helper to get column value with multiple possible names
      const getCol = (row: Record<string, unknown>, ...names: string[]): unknown => {
        for (const name of names) {
          if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name];
          }
        }
        return null;
      };

      // Process data based on type
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2; // +2 for 1-indexed and header row

        try {
          if (type === "jobs") {
            // Support new standardized format and legacy formats
            const jobId = getCol(row, 'JobID', 'job_id', 'JobId');
            const accountCode = getCol(row, 'Account Code', 'account_code', 'AccountCode', 'Customer Alpha Code');
            const siteName = getCol(row, 'Site Name', 'site_name', 'SiteName');
            // Portal Status is the customer-facing status, Status is internal code
            const portalStatus = getCol(row, 'Portal Status', 'portal_status');
            const internalStatus = getCol(row, 'Status', 'status');
            // Use Portal Status if available, otherwise fall back to Status
            const displayStatus = portalStatus || internalStatus;
            const jobType = getCol(row, 'Job Type', 'job_type', 'JobType');
            const equipment = getCol(row, 'Equipment', 'equipment');
            // Build description from Job Type and Equipment
            let shortDescription = jobType ? String(jobType) : "No description";
            if (equipment) {
              shortDescription += ` - ${String(equipment)}`;
            }
            const engineerName = getCol(row, 'Allocated Engineer', 'engineer_name', 'Employee', 'Engineer');
            const visitDate = getCol(row, 'Visit Date', 'visit_date', 'VisitDate');
            const partsDue = getCol(row, 'Parts Due', 'parts_due', 'due_date', 'Due', 'DueDate');
            const jobValue = getCol(row, 'Total Job Value', 'job_value_estimate', 'JobValue', 'Job Value');
            const postCode = getCol(row, 'PostCode', 'postcode', 'post_code');
            
            // For required fields, check the mapped values
            if (!jobId || !accountCode || !siteName) {
              errors.push({ row: rowNum, message: `Missing required fields (JobID, Account Code, or Site Name)` });
              continue;
            }

            // Include postcode in site name if available
            const fullSiteName = postCode ? `${String(siteName)} (${String(postCode)})` : String(siteName);

            await storage.createJob({
              jobId: String(jobId),
              accountCode: String(accountCode),
              siteName: fullSiteName,
              status: displayStatus ? String(displayStatus) : "Unknown",
              createdDate: new Date(),
              lastUpdatedDate: new Date(),
              shortDescription,
              engineerName: engineerName ? String(engineerName) : null,
              lastVisitDate: null,
              nextActionDueDate: null,
              priority: null,
              jobValueEstimate: jobValue ? String(jobValue) : null,
              dueDate: parseFlexibleDate(partsDue ? String(partsDue) : null),
              visitDate: parseFlexibleDate(visitDate ? String(visitDate) : null),
              equipment: equipment ? String(equipment).trim() : null,
              importBatchId: batch.id,
            });
            successCount++;
          } else if (type === "quotes") {
            const requiredFields = ["quote_id", "account_code", "quote_status", "net_total", "vat_total", "gross_total", "quote_date"];
            const missing = requiredFields.filter(f => !row[f]);
            
            if (missing.length > 0) {
              errors.push({ row: rowNum, message: `Missing required fields: ${missing.join(", ")}` });
              continue;
            }

            await storage.createQuote({
              quoteId: String(row.quote_id),
              jobId: row.job_id ? String(row.job_id) : null,
              accountCode: String(row.account_code),
              quoteStatus: String(row.quote_status),
              netTotal: String(row.net_total),
              vatTotal: String(row.vat_total),
              grossTotal: String(row.gross_total),
              quoteDate: new Date(String(row.quote_date)),
              leadTimeText: row.lead_time_text ? String(row.lead_time_text) : null,
              pdfUrl: row.pdf_url ? String(row.pdf_url) : null,
              quoteTextSummary: row.quote_text_summary ? String(row.quote_text_summary) : null,
              topLinesSummary: row.top_lines_summary ? String(row.top_lines_summary) : null,
              importBatchId: batch.id,
            });
            successCount++;
          } else if (type === "purchase_orders") {
            const requiredFields = ["po_id", "account_code", "po_status"];
            const missing = requiredFields.filter(f => !row[f]);
            
            if (missing.length > 0) {
              errors.push({ row: rowNum, message: `Missing required fields: ${missing.join(", ")}` });
              continue;
            }

            await storage.createPurchaseOrder({
              poId: String(row.po_id),
              accountCode: String(row.account_code),
              jobId: row.job_id ? String(row.job_id) : null,
              supplierName: row.supplier_name ? String(row.supplier_name) : null,
              poStatus: String(row.po_status),
              outstandingLinesCount: row.outstanding_lines_count ? parseInt(String(row.outstanding_lines_count)) : null,
              etaDate: row.eta_date ? new Date(String(row.eta_date)) : null,
              lastChasedDate: row.last_chased_date ? new Date(String(row.last_chased_date)) : null,
              importBatchId: batch.id,
            });
            successCount++;
          }
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      // Update last import timestamp
      await storage.setSystemSetting("last_import", new Date().toISOString());

      res.json({
        batchId: batch.id,
        rowCount: successCount,
        errorCount: errors.length,
        errors: errors.slice(0, 50), // Return first 50 errors
      });
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Replace jobs dataset (clears existing jobs, imports new ones, preserves overrides)
  app.post("/api/admin/import-replace", requireAuth("admin"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileName = req.file.originalname;
      
      // Try to parse CSV with different encodings
      let csvText: string;
      try {
        // First try UTF-8
        csvText = req.file.buffer.toString("utf-8");
        // Check if it looks like valid UTF-8 by parsing
        Papa.parse(csvText, { header: true, preview: 1 });
      } catch {
        // Fall back to ISO-8859-1 (Latin-1) for Windows files
        const iconv = await import("iconv-lite");
        csvText = iconv.decode(req.file.buffer, "ISO-8859-1");
      }

      // Also handle potential BOM
      if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
      }

      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const data = parsed.data as Record<string, unknown>[];

      if (data.length === 0) {
        return res.status(400).json({ message: "No data rows found in the file" });
      }

      // Validate required columns
      const firstRow = data[0];
      const columns = Object.keys(firstRow);
      const requiredColumnGroups = [
        { label: "Job ID", names: ["JobID", "job_id", "JobId"] },
        { label: "Account Code", names: ["Account Code", "account_code", "AccountCode", "Customer Alpha Code", "dbo_tblCustomer_Alpha"] },
        { label: "Site Name", names: ["Site Name", "site_name", "SiteName", "dbo_tblCustomer_1_Name", "Site Alpha", "dbo_tblCustomer_1_Alpha"] },
        { label: "Status", names: ["Portal Status", "portal_status", "StatusLabel", "PortalStage", "Status", "status"] },
      ];
      const missingColumns = requiredColumnGroups
        .filter((group) => !group.names.some((name) => columns.includes(name)))
        .map((group) => group.label);
      
      if (missingColumns.length > 0) {
        return res.status(400).json({ 
          message: `Missing required columns: ${missingColumns.join(", ")}`,
          hint: "Expected a recognized job ID, account code, site name, and status column",
          foundColumns: columns
        });
      }

      // Helper to get column value with multiple possible names
      const getCol = (row: Record<string, unknown>, ...names: string[]): unknown => {
        for (const name of names) {
          if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name];
          }
        }
        return null;
      };

      // Track job IDs to avoid duplicates
      const seenJobIds = new Set<string>();
      const jobsToInsert: Array<{
        jobId: string;
        accountCode: string;
        siteName: string;
        status: string;
        createdDate: Date;
        lastUpdatedDate: Date;
        shortDescription: string;
        engineerName: string | null;
        lastVisitDate: Date | null;
        nextActionDueDate: Date | null;
        priority: string | null;
        jobValueEstimate: string | null;
        dueDate: Date | null;
        visitDate: Date | null;
        equipment: string | null;
        importBatchId: string | null;
      }> = [];
      const errors: { row: number; message: string }[] = [];
      const accountsToCreate = new Map<string, { code: string; name: string }>();

      // Get existing accounts
      const existingAccounts = await storage.getAllCustomerAccounts();
      const existingAccountCodes = new Set(existingAccounts.map(a => a.accountCode));

      // Process each row
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2; // +2 for 1-indexed and header row

        try {
          const jobId = getCol(row, 'JobID', 'job_id', 'JobId');
          const accountCode = getCol(row, 'Account Code', 'account_code', 'AccountCode', 'Customer Alpha Code', 'dbo_tblCustomer_Alpha');
          const accountName = getCol(row, 'Account Name', 'account_name', 'AccountName', 'Customer Name', 'dbo_tblCustomer_Name');
          const siteName = getCol(row, 'Site Name', 'site_name', 'SiteName', 'dbo_tblCustomer_1_Name', 'Site Alpha', 'dbo_tblCustomer_1_Alpha');
          const portalStatus = getCol(row, 'Portal Status', 'portal_status', 'StatusLabel', 'PortalStage');
          const internalStatus = getCol(row, 'Status', 'status');
          const displayStatus = portalStatus || internalStatus;
          const jobType = getCol(row, 'Job Type', 'job_type', 'JobType', 'dbo_tblJobType_Name');
          const equipment = getCol(row, 'Equipment', 'equipment');
          const engineerName = getCol(row, 'Allocated Engineer', 'engineer_name', 'Employee', 'Engineer');
          const etaDate = getCol(row, 'ETA', 'Eta', 'ETA Date', 'eta_date');
          const statusText = displayStatus ? String(displayStatus).toLowerCase() : '';
          const visitDate = getCol(row, 'Visit Date', 'visit_date', 'VisitDate', 'Scheduled Date', 'Engineer Visit Date') || (statusText.includes('pending engineer') ? etaDate : null);
          const partsDue = getCol(row, 'Parts Due', 'parts_due', 'due_date', 'Due', 'DueDate', 'Parts ETA', 'Parts ETA Date') || (statusText.includes('awaiting parts') ? etaDate : null);
          const jobValue = getCol(row, 'Total Job Value', 'job_value_estimate', 'JobValue', 'Job Value');
          const postCode = getCol(row, 'PostCode', 'postcode', 'post_code');

          if (!jobId || !accountCode || !siteName) {
            errors.push({ row: rowNum, message: "Missing required fields (JobID, Account Code, or Site Name)" });
            continue;
          }

          const jobIdStr = String(jobId).trim();
          if (seenJobIds.has(jobIdStr)) {
            continue; // Skip duplicate job IDs
          }
          seenJobIds.add(jobIdStr);

          const accountCodeStr = String(accountCode).trim();
          const accountNameStr = accountName ? String(accountName).trim() : accountCodeStr;

          // Track new accounts to create
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
            jobValueEstimate: jobValue ? String(jobValue).replace(/[^0-9.-]/g, '') : null,
            dueDate: parseFlexibleDate(partsDue ? String(partsDue) : null),
            visitDate: parseFlexibleDate(visitDate ? String(visitDate) : null),
            equipment: equipment ? String(equipment).trim() : null,
            importBatchId: null,
          });
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      if (jobsToInsert.length === 0) {
        return res.status(400).json({ 
          message: "No valid jobs to import",
          errors: errors.slice(0, 20)
        });
      }

      // Create new customer accounts. Each gets a strong, random temporary password
      // and is flagged mustChangePassword=true. Generated passwords are returned ONCE
      // to the admin in the response so they can be securely communicated.
      const newAccounts: Array<{ accountCode: string; accountName: string; tempPassword: string }> = [];
      if (accountsToCreate.size > 0) {
        for (const entry of Array.from(accountsToCreate.entries())) {
          const [code, account] = entry;
          const tempPassword = generateTempPassword();
          const hashedPassword = await bcrypt.hash(tempPassword, 12);
          await storage.createCustomerAccount({
            accountCode: code,
            accountName: account.name,
            passwordHash: hashedPassword,
          });
          newAccounts.push({ accountCode: code, accountName: account.name, tempPassword });
        }
      }

      // Clear existing jobs (but NOT job_overrides - those persist)
      await storage.clearAllJobs();

      // Insert new jobs
      for (const job of jobsToInsert) {
        await storage.createJob(job);
      }

      // Update last import timestamp
      await storage.setSystemSetting("last_import", new Date().toISOString());

      await audit(req, "admin.import.replace", {
        targetType: "jobs",
        targetId: null,
        payload: {
          jobsImported: jobsToInsert.length,
          accountsCreated: accountsToCreate.size,
          newAccountCodes: newAccounts.map((a) => a.accountCode),
        },
      });

      res.json({
        success: true,
        jobsImported: jobsToInsert.length,
        accountsCreated: accountsToCreate.size,
        newAccounts, // Includes one-time temporary passwords — admin must distribute securely.
        duplicatesSkipped: data.length - jobsToInsert.length - errors.length,
        errorCount: errors.length,
        errors: errors.slice(0, 20),
      });
    } catch (error) {
      console.error("Import replace error:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error" });
    }
  });

  // Template downloads
  app.get("/api/admin/templates/jobs", requireAuth("admin"), (req, res) => {
    const csv = Papa.unparse([
      {
        job_id: "JOB001",
        account_code: "ACME001",
        site_name: "Main Office",
        status: "in_progress",
        created_date: "2024-01-15",
        last_updated_date: "2024-01-20",
        short_description: "HVAC repair",
        engineer_name: "John Smith",
        last_visit_date: "2024-01-18",
        next_action_due_date: "2024-01-25",
        priority: "Gold",
        job_value_estimate: "1500.00",
      },
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=jobs_template.csv");
    res.send(csv);
  });

  app.get("/api/admin/templates/quotes", requireAuth("admin"), (req, res) => {
    const csv = Papa.unparse([
      {
        quote_id: "QUO001",
        job_id: "JOB001",
        account_code: "ACME001",
        quote_status: "awaiting_approval",
        net_total: "1000.00",
        vat_total: "200.00",
        gross_total: "1200.00",
        quote_date: "2024-01-16",
        lead_time_text: "2-3 weeks",
        pdf_url: "",
        quote_text_summary: "HVAC unit replacement",
        top_lines_summary: "1x HVAC Unit, Labour",
      },
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=quotes_template.csv");
    res.send(csv);
  });

  return httpServer;
}
