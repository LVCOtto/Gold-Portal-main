import type { Router, Request } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { hasInternalAccess, normalizeInternalEmail, resolveInternalAccess } from "../internal-access";

const CALLBACKS_OTP_TTL_MS = 10 * 60 * 1000;
const CALLBACKS_OTP_MAX_ATTEMPTS = 5;
const CALLBACKS_LOCKOUT_MS = 15 * 60 * 1000;

const callbacksOtpLockout = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(email: string): number {
  const entry = callbacksOtpLockout.get(email);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  if (entry.lockedUntil !== 0 && entry.lockedUntil <= Date.now()) callbacksOtpLockout.delete(email);
  return 0;
}

function recordFailure(email: string) {
  const entry = callbacksOtpLockout.get(email) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= CALLBACKS_OTP_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + CALLBACKS_LOCKOUT_MS;
    entry.count = 0;
  }
  callbacksOtpLockout.set(email, entry);
}

function clearFailures(email: string) {
  callbacksOtpLockout.delete(email);
}

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashOtp(sessionId: string, email: string, code: string): string {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "callbacks-secret")
    .update(`callbacks:${email}:${sessionId}:${code}`)
    .digest("hex");
}

function clientIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  let ip = fwd || req.socket.remoteAddress || "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  return ip;
}

async function sendCallbacksOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY must be set to send callbacks login codes");
  if (!from) throw new Error("RESEND_FROM or EMAIL_FROM must be set to send callbacks login codes");

  const expiresInMinutes = Math.floor(CALLBACKS_OTP_TTL_MS / 60000);
  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject: "Gold Portal Callbacks - login code",
    text: `Your Callbacks Portal login code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    html: `<p>Your <strong>Callbacks Portal</strong> login code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;">${code}</p><p>It expires in ${expiresInMinutes} minutes.</p>`,
  };
  if (process.env.RESEND_REPLY_TO) payload.reply_to = process.env.RESEND_REPLY_TO;

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

export function registerCallbacksAuthRoutes(router: Router) {
  router.post("/auth/request-otp", async (req, res, next) => {
    try {
      const { email } = req.body as { email?: string };
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const normalised = normalizeInternalEmail(email);
      const access = await resolveInternalAccess(normalised);

      if (!hasInternalAccess(access, "callbacks")) {
        return res.status(403).json({ message: "That email address is not enabled for Callbacks access." });
      }

      const remainingLock = isLockedOut(normalised);
      if (remainingLock > 0) {
        return res.status(429).json({ message: `Too many attempts. Try again in ${Math.ceil(remainingLock / 60000)} minute(s).` });
      }

      const code = generateOtp();
      req.session.callbacksOtp = {
        email: normalised,
        codeHash: hashOtp(req.sessionID, normalised, code),
        expiresAt: Date.now() + CALLBACKS_OTP_TTL_MS,
        attempts: 0,
        sentAt: Date.now(),
        requestIp: clientIp(req),
      };

      await saveSession(req);
      await sendCallbacksOtpEmail(normalised, code);

      return res.json({ sent: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/auth/verify-otp", async (req, res, next) => {
    try {
      const { code } = req.body as { code?: string };
      const pending = req.session.callbacksOtp;

      if (!pending || !code) {
        return res.status(400).json({ message: "No pending OTP or code missing" });
      }

      if (Date.now() > pending.expiresAt) {
        delete req.session.callbacksOtp;
        return res.status(400).json({ message: "Code has expired - request a new one" });
      }

      if (pending.attempts >= CALLBACKS_OTP_MAX_ATTEMPTS) {
        delete req.session.callbacksOtp;
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
      if (!hasInternalAccess(access, "callbacks")) {
        delete req.session.callbacksOtp;
        await saveSession(req);
        return res.status(403).json({ message: "This email address is no longer allowed to access the callbacks portal" });
      }

      clearFailures(pending.email);
      delete req.session.callbacksOtp;
      req.session.callbacksOperator = { email: pending.email, loginAt: new Date().toISOString() };
      await saveSession(req);
      await storage.updateInternalAccessLastLogin(pending.email).catch(() => undefined);

      return res.json({ operator: { email: pending.email } });
    } catch (err) {
      next(err);
    }
  });

  router.get("/auth/me", (req, res) => {
    if (!req.session?.callbacksOperator) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ operator: req.session.callbacksOperator });
  });

  router.post("/auth/logout", async (req, res, next) => {
    try {
      delete req.session.callbacksOperator;
      delete req.session.callbacksOtp;
      await saveSession(req);
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}