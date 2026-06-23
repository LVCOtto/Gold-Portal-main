import type { Router, Request } from "express";
import crypto from "crypto";

// ── Constants ──────────────────────────────────────────────────────────────
const COMMS_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const COMMS_OTP_MAX_ATTEMPTS = 5;
const COMMS_LOCKOUT_MS = 15 * 60 * 1000;

const commsOtpLockout = new Map<string, { count: number; lockedUntil: number }>();

// ── Helpers ────────────────────────────────────────────────────────────────

function getAllowedEmails(): string[] {
  const raw = process.env.COMMS_ALLOWED_EMAILS || process.env.ADMIN_EMAIL || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isEmailAllowed(email: string): boolean {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

function isLockedOut(email: string): number {
  const entry = commsOtpLockout.get(email);
  if (!entry) return 0;
  if (entry.lockedUntil > Date.now()) return entry.lockedUntil - Date.now();
  if (entry.lockedUntil !== 0 && entry.lockedUntil <= Date.now()) commsOtpLockout.delete(email);
  return 0;
}

function recordFailure(email: string) {
  const entry = commsOtpLockout.get(email) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= COMMS_OTP_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + COMMS_LOCKOUT_MS;
    entry.count = 0;
  }
  commsOtpLockout.set(email, entry);
}

function clearFailures(email: string) {
  commsOtpLockout.delete(email);
}

function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashOtp(sessionId: string, email: string, code: string): string {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "comms-secret")
    .update(`comms:${email}:${sessionId}:${code}`)
    .digest("hex");
}

function clientIp(req: Request): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  let ip = fwd || req.socket.remoteAddress || "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  return ip;
}

async function sendCommsOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM;
  if (!apiKey) throw new Error("RESEND_API_KEY must be set to send comms login codes");
  if (!from) throw new Error("RESEND_FROM or EMAIL_FROM must be set to send comms login codes");

  const expiresInMinutes = Math.floor(COMMS_OTP_TTL_MS / 60000);
  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject: "Gold Portal Comms — login code",
    text: `Your Comms Portal login code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    html: `<p>Your <strong>Comms Portal</strong> login code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;">${code}</p><p>It expires in ${expiresInMinutes} minutes.</p>`,
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

// ── Route registration ─────────────────────────────────────────────────────

export function registerCommsAuthRoutes(router: Router) {
  // POST /api/comms/auth/request-otp
  router.post("/auth/request-otp", async (req, res, next) => {
    try {
      const { email } = req.body as { email?: string };
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "email is required" });
      }
      const normalised = email.trim().toLowerCase();

      if (!isEmailAllowed(normalised)) {
        // Return same response as success — don't reveal which emails are allowed
        return res.json({ sent: true });
      }

      const remainingLock = isLockedOut(normalised);
      if (remainingLock > 0) {
        return res.status(429).json({
          error: `Too many attempts. Try again in ${Math.ceil(remainingLock / 60000)} minute(s).`,
        });
      }

      const code = generateOtp();
      const hash = hashOtp(req.sessionID, normalised, code);

      req.session.commsOtp = {
        email: normalised,
        codeHash: hash,
        expiresAt: Date.now() + COMMS_OTP_TTL_MS,
        attempts: 0,
        sentAt: Date.now(),
        requestIp: clientIp(req),
      };
      await saveSession(req);
      await sendCommsOtpEmail(normalised, code);

      return res.json({ sent: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/comms/auth/verify-otp
  router.post("/auth/verify-otp", async (req, res, next) => {
    try {
      const { code } = req.body as { code?: string };
      const pending = req.session.commsOtp;

      if (!pending || !code) {
        return res.status(400).json({ error: "No pending OTP or code missing" });
      }

      if (Date.now() > pending.expiresAt) {
        delete req.session.commsOtp;
        return res.status(400).json({ error: "Code has expired — request a new one" });
      }

      if (pending.attempts >= COMMS_OTP_MAX_ATTEMPTS) {
        delete req.session.commsOtp;
        recordFailure(pending.email);
        return res.status(429).json({ error: "Too many attempts — request a new code" });
      }

      const expectedHash = pending.codeHash; // stored at request-otp time
      const inputHash = hashOtp(req.sessionID, pending.email, code.trim());

      // Constant-time compare
      const expected = Buffer.from(expectedHash, "hex");
      const input = Buffer.from(inputHash, "hex");
      const valid =
        expected.length === input.length &&
        crypto.timingSafeEqual(expected, input);

      if (!valid) {
        pending.attempts += 1;
        await saveSession(req);
        recordFailure(pending.email);
        return res.status(401).json({ error: "Invalid code" });
      }

      clearFailures(pending.email);
      delete req.session.commsOtp;
      req.session.commsOperator = { email: pending.email, loginAt: new Date().toISOString() };
      await saveSession(req);

      return res.json({ operator: { email: pending.email } });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/comms/auth/me
  router.get("/auth/me", (req, res) => {
    if (!req.session?.commsOperator) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.json({ operator: req.session.commsOperator });
  });

  // POST /api/comms/auth/logout
  router.post("/auth/logout", async (req, res, next) => {
    try {
      delete req.session.commsOperator;
      delete req.session.commsOtp;
      await saveSession(req);
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}
