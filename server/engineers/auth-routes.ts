import type { Request, Router } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { hasInternalAccess, normalizeInternalEmail, resolveInternalAccess } from "../internal-access";

const ENGINEER_OTP_TTL_MS = 10 * 60 * 1000;
const ENGINEER_OTP_MAX_ATTEMPTS = 5;
const ENGINEER_LOCKOUT_MS = 15 * 60 * 1000;

const engineerOtpLockout = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(email: string): number {
  const entry = engineerOtpLockout.get(email);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  if (entry.lockedUntil !== 0 && entry.lockedUntil <= Date.now()) engineerOtpLockout.delete(email);
  return 0;
}

function recordFailure(email: string) {
  const entry = engineerOtpLockout.get(email) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= ENGINEER_OTP_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + ENGINEER_LOCKOUT_MS;
    entry.count = 0;
  }
  engineerOtpLockout.set(email, entry);
}

function clearFailures(email: string) {
  engineerOtpLockout.delete(email);
}

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashOtp(sessionId: string, email: string, code: string): string {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "engineer-secret")
    .update(`engineer:${email}:${sessionId}:${code}`)
    .digest("hex");
}

function clientIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  let ip = fwd || req.socket.remoteAddress || "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  return ip;
}

function parseEngineerNames(displayName: string | null): string[] {
  return (displayName || "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
}

async function sendEngineerOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY must be set to send engineer login codes");
  if (!from) throw new Error("RESEND_FROM or EMAIL_FROM must be set to send engineer login codes");

  const expiresInMinutes = Math.floor(ENGINEER_OTP_TTL_MS / 60000);
  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject: "Gold Portal Engineer Hub - login code",
    text: `Your Engineer Hub login code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    html: `<p>Your <strong>Engineer Hub</strong> login code is:</p><p style=\"font-size:28px;letter-spacing:6px;font-weight:700;\">${code}</p><p>It expires in ${expiresInMinutes} minutes.</p>`,
  };

  if (process.env.RESEND_REPLY_TO) {
    payload.reply_to = process.env.RESEND_REPLY_TO;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export function registerEngineerAuthRoutes(router: Router) {
  router.post("/auth/request-otp", async (req, res, next) => {
    try {
      const { email } = req.body as { email?: string };
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalized = normalizeInternalEmail(email);
      const access = await resolveInternalAccess(normalized);
      const canUseEngineerHub = hasInternalAccess(access, "engineer") || access.canAdmin;

      if (!canUseEngineerHub) {
        return res.status(403).json({ message: "That email address is not enabled for Engineer Hub access." });
      }

      const remainingLock = isLockedOut(normalized);
      if (remainingLock > 0) {
        return res.status(429).json({ message: `Too many attempts. Try again in ${Math.ceil(remainingLock / 60000)} minute(s).` });
      }

      const code = generateOtp();
      req.session.engineerOtp = {
        email: normalized,
        codeHash: hashOtp(req.sessionID, normalized, code),
        expiresAt: Date.now() + ENGINEER_OTP_TTL_MS,
        attempts: 0,
        sentAt: Date.now(),
        requestIp: clientIp(req),
      };

      await saveSession(req);
      await sendEngineerOtpEmail(normalized, code);

      return res.json({ sent: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/verify-otp", async (req, res, next) => {
    try {
      const { code } = req.body as { code?: string };
      const pending = req.session.engineerOtp;

      if (!pending || !code) {
        return res.status(400).json({ message: "No pending OTP or code missing" });
      }

      if (Date.now() > pending.expiresAt) {
        delete req.session.engineerOtp;
        return res.status(400).json({ message: "Code has expired - request a new one" });
      }

      if (pending.attempts >= ENGINEER_OTP_MAX_ATTEMPTS) {
        delete req.session.engineerOtp;
        recordFailure(pending.email);
        return res.status(429).json({ message: "Too many attempts - request a new code" });
      }

      const expected = Buffer.from(pending.codeHash, "hex");
      const input = Buffer.from(hashOtp(req.sessionID, pending.email, code.trim()), "hex");
      const valid = expected.length === input.length && crypto.timingSafeEqual(expected, input);

      if (!valid) {
        pending.attempts += 1;
        await saveSession(req);
        recordFailure(pending.email);
        return res.status(401).json({ message: "Invalid code" });
      }

      const access = await resolveInternalAccess(pending.email);
      const canUseEngineerHub = hasInternalAccess(access, "engineer") || access.canAdmin;
      if (!canUseEngineerHub) {
        delete req.session.engineerOtp;
        await saveSession(req);
        return res.status(403).json({ message: "This email address is no longer allowed to access Engineer Hub" });
      }

      const engineerNames = parseEngineerNames(access.displayName);
      const canSelectEngineer = engineerNames.length === 0 && access.canAdmin;

      if (engineerNames.length === 0 && !canSelectEngineer) {
        delete req.session.engineerOtp;
        await saveSession(req);
        return res.status(403).json({
          message: "Your user is missing an engineer display name. Ask an admin to set your display name to your job engineer name.",
        });
      }

      clearFailures(pending.email);
      delete req.session.engineerOtp;
      req.session.engineerOperator = {
        email: pending.email,
        loginAt: new Date().toISOString(),
        displayName: access.displayName || "Engineer Hub Admin",
        engineerNames,
        canSelectEngineer,
      };

      await saveSession(req);
      await storage.updateInternalAccessLastLogin(pending.email).catch(() => undefined);

      return res.json({
        operator: {
          email: pending.email,
          displayName: req.session.engineerOperator.displayName,
          engineerNames,
          canSelectEngineer,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/auth/me", (req, res) => {
    if (!req.session?.engineerOperator) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ operator: req.session.engineerOperator });
  });

  router.post("/auth/logout", async (req, res, next) => {
    try {
      delete req.session.engineerOperator;
      delete req.session.engineerOtp;
      await saveSession(req);
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}
