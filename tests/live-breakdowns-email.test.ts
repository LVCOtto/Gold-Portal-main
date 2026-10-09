import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { getLiveBreakdownsWeekAnchor, getLiveBreakdownsWeeklyToken } from "../server/live-breakdowns.ts";
import { sendWeeklyLiveBreakdownsEmail, startLiveBreakdownsWeeklyEmail } from "../server/live-breakdowns-email.ts";

const config = {
  apiKey: "test-key",
  from: "LVC Portal <portal@example.com>",
  recipient: "otto@lvcuk.com",
  appUrl: "https://portal.example.com",
  replyTo: "service@example.com",
};

function createStore() {
  const values = new Map<string, string>();
  return {
    values,
    async getSystemSetting(key: string) { return values.get(key) ?? null; },
    async setSystemSetting(key: string, value: string) { values.set(key, value); },
  };
}

test("weekly token changes only at Saturday midnight in server timezone", () => {
  const friday = new Date(2026, 9, 9, 23, 59, 59);
  const saturday = new Date(2026, 9, 10, 0, 0, 0);
  assert.equal(getLiveBreakdownsWeekAnchor(friday), "2026-10-03");
  assert.equal(getLiveBreakdownsWeekAnchor(saturday), "2026-10-10");
  assert.notEqual(getLiveBreakdownsWeeklyToken(friday), getLiveBreakdownsWeeklyToken(saturday));
  assert.equal(getLiveBreakdownsWeeklyToken(saturday), getLiveBreakdownsWeeklyToken(new Date(2026, 9, 16, 23, 59)));
});

test("sends the current public link, skips repeats/restarts, and sends a fresh link next week", async () => {
  const store = createStore();
  const requests: RequestInit[] = [];
  const send: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    requests.push(options!);
    return Response.json({ id: "email-123" });
  };
  const date = new Date(2026, 9, 10, 0, 0);
  assert.equal(await sendWeeklyLiveBreakdownsEmail(store, config, date, send), true);
  const payload = JSON.parse(requests[0].body as string);
  const url = `${config.appUrl}/live-breakdowns/${getLiveBreakdownsWeeklyToken(date)}`;
  assert.deepEqual(payload.to, ["otto@lvcuk.com"]);
  assert.equal(payload.from, config.from);
  assert.equal(payload.reply_to, config.replyTo);
  assert.ok(payload.text.includes(url));
  assert.ok(payload.html.includes(url));
  assert.ok(payload.text.includes("Saturday midnight"));
  assert.equal(await sendWeeklyLiveBreakdownsEmail(store, config, new Date(2026, 9, 14), send), false);
  assert.equal(requests.length, 1);
  assert.equal(await sendWeeklyLiveBreakdownsEmail(store, config, new Date(2026, 9, 17), send), true);
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].body, requests[1].body);
});

test("failed delivery is not marked sent and retry uses the same idempotency key", async () => {
  const store = createStore();
  const keys: string[] = [];
  let succeed = false;
  const send: typeof fetch = async (_url, options) => {
    keys.push(new Headers(options?.headers).get("Idempotency-Key")!);
    return succeed ? Response.json({ id: "email-123" }) : new Response("", { status: 429 });
  };
  const date = new Date(2026, 9, 12);
  await assert.rejects(sendWeeklyLiveBreakdownsEmail(store, config, date, send), /HTTP 429/);
  assert.equal(store.values.size, 0);
  succeed = true;
  assert.equal(await sendWeeklyLiveBreakdownsEmail(store, config, date, send), true);
  assert.equal(keys[0], keys[1]);
});

test("ambiguous network failure and malformed success do not mark delivery complete", async () => {
  const store = createStore();
  const failedFetch: typeof fetch = async () => { throw new Error("network failure"); };
  await assert.rejects(sendWeeklyLiveBreakdownsEmail(store, config, undefined, failedFetch), /network failure/);
  const malformed: typeof fetch = async () => Response.json({});
  await assert.rejects(sendWeeklyLiveBreakdownsEmail(store, config, undefined, malformed), /no email ID/);
  assert.equal(store.values.size, 0);
});

test("database write failure retries with the same Resend payload and idempotency key", async () => {
  let failWrite = true;
  const store = createStore();
  const requests: RequestInit[] = [];
  const send: typeof fetch = async (_url, options) => {
    requests.push(options!);
    return Response.json({ id: "email-123" });
  };
  const savingStore = {
    getSystemSetting: store.getSystemSetting,
    async setSystemSetting(key: string, value: string) {
      if (failWrite) throw new Error("database unavailable");
      await store.setSystemSetting(key, value);
    },
  };
  const date = new Date(2026, 9, 12);
  await assert.rejects(sendWeeklyLiveBreakdownsEmail(savingStore, config, date, send), /database unavailable/);
  failWrite = false;
  await sendWeeklyLiveBreakdownsEmail(savingStore, config, date, send);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(new Headers(requests[0].headers).get("Idempotency-Key"), new Headers(requests[1].headers).get("Idempotency-Key"));
});

test("worker is off in development and logs missing configuration in production", () => {
  const previous = { ...process.env };
  const messages: string[] = [];
  const unusedPool = new pg.Pool();
  try {
    delete process.env.LIVE_BREAKDOWNS_WEEKLY_EMAIL_ENABLED;
    process.env.NODE_ENV = "development";
    startLiveBreakdownsWeeklyEmail(unusedPool, (message) => messages.push(message));
    assert.match(messages.pop()!, /disabled/);
    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    startLiveBreakdownsWeeklyEmail(unusedPool, (message) => messages.push(message));
    assert.match(messages.pop()!, /cannot start/);
    process.env.LIVE_BREAKDOWNS_WEEKLY_EMAIL_ENABLED = "false";
    startLiveBreakdownsWeeklyEmail(unusedPool, (message) => messages.push(message));
    assert.match(messages.pop()!, /disabled/);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});

test("worker starts immediately, persists delivery, skips duplicates and skips a locked replica", async (context) => {
  const previous = { ...process.env };
  const pool = new pg.Pool();
  const queries: string[] = [];
  let delivered: string | null = null;
  let acquired = true;
  let sends = 0;
  let releases = 0;
  const client = {
    async query(sql: string, params?: string[]) {
      queries.push(sql);
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired }] };
      if (sql.startsWith("SELECT value")) return { rows: delivered ? [{ value: delivered }] : [] };
      if (sql.startsWith("INSERT INTO system_settings")) delivered = params![1];
      return { rows: [] };
    },
    release() { releases++; },
  };
  context.mock.method(pool, "connect", async () => client);
  context.mock.method(globalThis, "fetch", async () => {
    sends++;
    return Response.json({ id: "email-123" });
  });
  context.mock.timers.enable({ apis: ["setInterval"] });
  const messages: string[] = [];
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      LIVE_BREAKDOWNS_WEEKLY_EMAIL_ENABLED: "true",
      RESEND_API_KEY: config.apiKey,
      RESEND_FROM: config.from,
      LIVE_BREAKDOWNS_WEEKLY_EMAIL_TO: config.recipient,
      PUBLIC_APP_URL: config.appUrl,
      SESSION_SECRET: "test-secret",
    });
    delete process.env.RESEND_REPLY_TO;
    startLiveBreakdownsWeeklyEmail(pool, (message) => messages.push(message));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(sends, 1);
    assert.ok(delivered);
    assert.ok(queries.includes("COMMIT"));
    assert.equal(releases, 1);
    context.mock.timers.tick(60_000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(sends, 1);
    assert.equal(releases, 2);
    acquired = false;
    context.mock.timers.tick(60_000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(sends, 1);
    assert.equal(releases, 3);
    assert.equal(messages.filter((message) => message.includes("accepted by Resend")).length, 1);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});
