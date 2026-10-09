import crypto from "crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { renderBrandedOperationalEmail, SERVICE_UPDATE_SENDER } from "./email-branding";
import { getLiveBreakdownsWeekAnchor, getLiveBreakdownsWeeklyToken } from "./live-breakdowns";

const DELIVERY_SETTING_KEY = "live_breakdowns_weekly_email_delivery";
const POLL_INTERVAL_MS = 60_000;

interface WeeklyEmailConfig {
  apiKey: string;
  from: string;
  recipient: string;
  appUrl: string;
  replyTo?: string;
}

interface DeliveryStore {
  getSystemSetting(key: string): Promise<string | null>;
  setSystemSetting(key: string, value: string): Promise<void>;
}

export async function sendWeeklyLiveBreakdownsEmail(
  store: DeliveryStore,
  config: WeeklyEmailConfig,
  date = new Date(),
  fetchRequest: typeof fetch = fetch,
): Promise<boolean> {
  const weekAnchor = getLiveBreakdownsWeekAnchor(date);
  const token = getLiveBreakdownsWeeklyToken(date);
  const shareUrl = new URL(`/live-breakdowns/${token}`, config.appUrl).href;
  const deliveryId = crypto.createHash("sha256")
    .update(`${weekAnchor}:${config.recipient}:${shareUrl}`)
    .digest("hex");

  if (await store.getSystemSetting(DELIVERY_SETTING_KEY) === deliveryId) {
    return false;
  }

  const subject = `LVC live breakdowns - weekly link (${weekAnchor})`;
  const text = `Hi Otto,\n\nYour fresh live breakdown list link for the week beginning ${weekAnchor} is:\n\n${shareUrl}\n\nThis link expires at the next Saturday midnight rollover (server timezone). Previous weeks' links no longer work. You can forward this link to anyone who needs access to this week's list.`;
  const response = await fetchRequest("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `live-breakdowns-${deliveryId}`,
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      from: config.from,
      to: [config.recipient],
      subject,
      text,
      html: renderBrandedOperationalEmail({
        subject,
        bodyText: text,
        sender: { ...SERVICE_UPDATE_SENDER, headerTitle: "Live Breakdown List" },
      }),
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Weekly breakdown email delivery failed (Resend HTTP ${response.status})`);
  }

  const result: unknown = await response.json();
  if (!z.object({ id: z.string().min(1) }).safeParse(result).success) {
    throw new Error("Weekly breakdown email delivery returned no email ID");
  }

  await store.setSystemSetting(DELIVERY_SETTING_KEY, deliveryId);
  return true;
}

export function startLiveBreakdownsWeeklyEmail(
  pool: Pool,
  log: (message: string, source?: string) => void,
): void {
  const enabled = process.env.LIVE_BREAKDOWNS_WEEKLY_EMAIL_ENABLED;
  if (enabled === "false" || (enabled !== "true" && process.env.NODE_ENV !== "production")) {
    log("Weekly breakdown email disabled", "live-breakdowns-email");
    return;
  }

  const config = {
    apiKey: (process.env.RESEND_API_KEY || "").trim(),
    from: (process.env.RESEND_FROM || process.env.EMAIL_FROM || "").trim(),
    recipient: (process.env.LIVE_BREAKDOWNS_WEEKLY_EMAIL_TO || "otto@lvcuk.com").trim(),
    appUrl: (process.env.PUBLIC_APP_URL || (
      process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ""
    )).trim(),
    replyTo: process.env.RESEND_REPLY_TO?.trim() || undefined,
  };
  const parsed = z.object({
    apiKey: z.string().min(1),
    from: z.string().min(1),
    recipient: z.string().email(),
    appUrl: z.string().url().refine((value) => /^https:\/\//i.test(value)),
    replyTo: z.string().email().optional(),
  }).safeParse(config);

  if (!parsed.success || !(process.env.SESSION_SECRET || "").trim()) {
    const fields = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
    if (!(process.env.SESSION_SECRET || "").trim()) fields.push("SESSION_SECRET");
    log(`Weekly breakdown email cannot start: invalid or missing ${fields.join(", ")}. Check RESEND_API_KEY, RESEND_FROM/EMAIL_FROM, PUBLIC_APP_URL and recipient settings.`, "live-breakdowns-email");
    return;
  }

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // A transaction-scoped lock prevents duplicate sends across app replicas.
        const lock = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(714209, 1) AS acquired",
        );
        if (lock.rows[0]?.acquired) {
          const sent = await sendWeeklyLiveBreakdownsEmail({
            async getSystemSetting(key) {
              const result = await client.query<{ value: string }>(
                "SELECT value FROM system_settings WHERE key = $1", [key],
              );
              return result.rows[0]?.value ?? null;
            },
            async setSystemSetting(key, value) {
              await client.query(
                "INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
                [key, value],
              );
            },
          }, parsed.data);
          if (sent) log("Current weekly breakdown link accepted by Resend", "live-breakdowns-email");
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      log(`Weekly breakdown email failed; retrying on next check: ${error instanceof Error ? error.message : String(error)}`, "live-breakdowns-email");
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(() => void run(), POLL_INTERVAL_MS);
  log("Weekly breakdown email started; checking every 60 seconds, with startup catch-up", "live-breakdowns-email");
}
