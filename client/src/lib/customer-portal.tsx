import { createContext, useContext, type ReactNode } from "react";

type PortalMode = "customer" | "admin";
type QueryValue = string | number | boolean | null | undefined;

type QueryParams = Record<string, QueryValue>;

interface PortalRoutes {
  dashboard: string;
  jobs: string;
  jobsWithStatus: (status: string) => string;
  jobDetail: (jobId: string) => string;
  quotes: string;
  quoteDetail: (quoteId: string) => string;
}

interface PortalApi {
  dashboardStats: string;
  jobs: string;
  jobDetail: (jobId: string) => string;
  quotes: string;
  quoteDetail: (quoteId: string) => string;
  exportJobsPdf: (params?: QueryParams) => string;
  exportQuotes: (params?: QueryParams) => string;
}

export interface CustomerPortalValue {
  mode: PortalMode;
  isAdminMode: boolean;
  accountCode?: string;
  accountName?: string;
  accountParams: QueryParams;
  withAccountParams: (params?: QueryParams) => QueryParams;
  routes: PortalRoutes;
  api: PortalApi;
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

export function appendQueryParams(url: string, params?: QueryParams): string {
  if (!params) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  if (!queryString) return url;

  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
}

export function createCustomerPortalValue(options?: {
  mode?: PortalMode;
  accountCode?: string;
  accountName?: string;
}): CustomerPortalValue {
  const mode = options?.mode ?? "customer";
  const accountCode = options?.accountCode;
  const encodedAccountCode = accountCode ? encodePathPart(accountCode) : "";
  const isAdminMode = mode === "admin";
  const adminBase = isAdminMode ? `/admin/customer/${encodedAccountCode}` : "";
  const accountParams = isAdminMode && accountCode ? { accountCode } : {};
  const withAccountParams = (params: QueryParams = {}) => ({ ...accountParams, ...params });

  const routes: PortalRoutes = isAdminMode
    ? {
        dashboard: adminBase,
        jobs: `${adminBase}/jobs`,
        jobsWithStatus: (status) => appendQueryParams(`${adminBase}/jobs`, { status }),
        jobDetail: (jobId) => `${adminBase}/jobs/${encodePathPart(jobId)}`,
        quotes: `${adminBase}/quotes`,
        quoteDetail: (quoteId) => `${adminBase}/quotes/${encodePathPart(quoteId)}`,
      }
    : {
        dashboard: "/dashboard",
        jobs: "/jobs",
        jobsWithStatus: (status) => appendQueryParams("/jobs", { status }),
        jobDetail: (jobId) => `/jobs/${encodePathPart(jobId)}`,
        quotes: "/quotes",
        quoteDetail: (quoteId) => `/quotes/${encodePathPart(quoteId)}`,
      };

  const api: PortalApi = {
    dashboardStats: "/api/dashboard/stats",
    jobs: "/api/jobs",
    jobDetail: (jobId) => `/api/jobs/${encodePathPart(jobId)}`,
    quotes: "/api/quotes",
    quoteDetail: (quoteId) => `/api/quotes/${encodePathPart(quoteId)}`,
    exportJobsPdf: (params) => appendQueryParams("/api/export/jobs/pdf", withAccountParams(params)),
    exportQuotes: (params) => appendQueryParams("/api/export/quotes", withAccountParams(params)),
  };

  return {
    mode,
    isAdminMode,
    accountCode,
    accountName: options?.accountName,
    accountParams,
    withAccountParams,
    routes,
    api,
  };
}

const defaultPortalValue = createCustomerPortalValue();
const CustomerPortalContext = createContext<CustomerPortalValue>(defaultPortalValue);

export function CustomerPortalProvider({ value, children }: { value: CustomerPortalValue; children: ReactNode }) {
  return <CustomerPortalContext.Provider value={value}>{children}</CustomerPortalContext.Provider>;
}

export function useCustomerPortal() {
  return useContext(CustomerPortalContext);
}
