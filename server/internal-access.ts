import { storage } from "./storage";

export type InternalPortalScope = "admin" | "workshop" | "comms" | "callbacks";

export type ResolvedInternalAccess = {
  email: string;
  displayName: string | null;
  canAdmin: boolean;
  canWorkshop: boolean;
  canComms: boolean;
  canCallbacks: boolean;
  isActive: boolean;
  source: "database" | "legacy_admin" | "legacy_workshop" | "legacy_comms" | "none";
};

export function normalizeInternalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isMissingCanCallbacksColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybe = error as { code?: string; message?: string };
  return maybe.code === "42703" && (maybe.message || "").toLowerCase().includes("can_callbacks");
}

function getLegacyCommsAllowedEmails(): string[] {
  return (process.env.COMMS_ALLOWED_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((value) => normalizeInternalEmail(value))
    .filter(Boolean);
}

export async function resolveInternalAccess(email: string): Promise<ResolvedInternalAccess> {
  const normalizedEmail = normalizeInternalEmail(email);
  let existing: Awaited<ReturnType<typeof storage.getInternalAccessUserByEmail>>;

  try {
    existing = await storage.getInternalAccessUserByEmail(normalizedEmail);
  } catch (error) {
    // Temporary compatibility fallback during rollout where app code can include
    // can_callbacks before the database column exists.
    if (!isMissingCanCallbacksColumnError(error)) {
      throw error;
    }
    existing = undefined;
  }

  if (existing) {
    return {
      email: normalizeInternalEmail(existing.email),
      displayName: existing.displayName || null,
      canAdmin: !!existing.canAdmin,
      canWorkshop: !!existing.canWorkshop,
      canComms: !!existing.canComms,
      canCallbacks: !!existing.canCallbacks,
      isActive: !!existing.isActive,
      source: "database",
    };
  }

  const legacyAdminEmail = normalizeInternalEmail(process.env.ADMIN_EMAIL || "otto@lvcuk.com");
  if (normalizedEmail === legacyAdminEmail) {
    return {
      email: normalizedEmail,
      displayName: null,
      canAdmin: true,
      canWorkshop: false,
      canComms: false,
      canCallbacks: false,
      isActive: true,
      source: "legacy_admin",
    };
  }

  const legacyWorkshopEmail = normalizeInternalEmail((await storage.getSystemSetting("workshop_team_email")) || "");
  if (legacyWorkshopEmail && normalizedEmail === legacyWorkshopEmail) {
    return {
      email: normalizedEmail,
      displayName: null,
      canAdmin: false,
      canWorkshop: true,
      canComms: false,
      canCallbacks: false,
      isActive: true,
      source: "legacy_workshop",
    };
  }

  if (getLegacyCommsAllowedEmails().includes(normalizedEmail)) {
    return {
      email: normalizedEmail,
      displayName: null,
      canAdmin: false,
      canWorkshop: false,
      canComms: true,
      canCallbacks: false,
      isActive: true,
      source: "legacy_comms",
    };
  }

  return {
    email: normalizedEmail,
    displayName: null,
    canAdmin: false,
    canWorkshop: false,
    canComms: false,
    canCallbacks: false,
    isActive: false,
    source: "none",
  };
}

export function hasInternalAccess(access: ResolvedInternalAccess, scope: InternalPortalScope): boolean {
  if (!access.isActive) {
    return false;
  }

  if (scope === "admin") return access.canAdmin;
  if (scope === "workshop") return access.canWorkshop;
  return scope === "callbacks" ? access.canCallbacks : access.canComms;
}