import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startLiveJobsAutoImport } from "./live-import";
import { startCommsAutoImport } from "./comms/import-worker";
import { startCommsQueueWorker } from "./comms/queue-worker";

const app = express();
const httpServer = createServer(app);
const workshopPublicHost = (process.env.WORKSHOP_PUBLIC_HOST || "").trim().toLowerCase();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Trust the platform proxy (Railway, Cloudflare, etc.) so req.ip and rate limiting
// see the real client IP rather than the proxy IP.
app.set("trust proxy", 1);

// Security headers
const isProduction = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    crossOriginEmbedderPolicy: false,
  }),
);

// Force HTTPS redirect when behind a TLS-terminating proxy.
if (isProduction || process.env.FORCE_HTTPS === "true") {
  app.use((req, res, next) => {
    if (req.path === "/api/health") return next();
    const proto = req.headers["x-forwarded-proto"];
    if (proto && proto !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

if (workshopPublicHost) {
  app.use((req, res, next) => {
    const requestHost = (req.hostname || "").trim().toLowerCase();
    if (!requestHost || requestHost !== workshopPublicHost) {
      return next();
    }

    if (req.path.startsWith("/api") || req.path.startsWith("/workshop") || req.path.startsWith("/assets/") || req.path === "/favicon.ico") {
      return next();
    }

    return res.redirect(302, "/workshop/login");
  });
}

app.use(
  express.json({
    limit: "500kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "500kb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// PII keys that must never appear in logs.
const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "tempPassword",
  "newPassword",
  "currentPassword",
  "approverEmail",
  "approver_email",
  "customerPoNumber",
  "customer_po_number",
  "contactEmail",
  "contact_email",
  "secret",
  "token",
  "authorization",
  "cookie",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACTED_KEYS.has(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const safe = redact(capturedJsonResponse);
        const json = JSON.stringify(safe);
        logLine += ` :: ${json.length > 500 ? json.slice(0, 500) + "\u2026" : json}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  startLiveJobsAutoImport(log);
  startCommsAutoImport();
  startCommsQueueWorker();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    // Surface the underlying error stack so we can diagnose post-response failures
    // (e.g. session save errors that fire after res.json).
    log(`error ${status}: ${message}${err.stack ? "\n" + err.stack : ""}`, "express");
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
