import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
        throw new Error(data.message);
      }
      throw new Error(JSON.stringify(data) || res.statusText);
    }

    const text = (await res.text()) || res.statusText;
    throw new Error(text);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    // CSRF defense: server requires this header on mutating requests.
    "X-Requested-By": "lvc-portal",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (data !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

function buildUrl(queryKey: readonly unknown[]): string {
  const [baseUrl, ...rest] = queryKey;
  
  if (typeof baseUrl !== "string") {
    throw new Error("First element of queryKey must be a string URL");
  }

  if (rest.length === 0) {
    return baseUrl;
  }

  const params = new URLSearchParams();
  
  for (const item of rest) {
    if (typeof item === "object" && item !== null) {
      for (const [key, value] of Object.entries(item)) {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, String(value));
        }
      }
    } else if (typeof item === "string" || typeof item === "number") {
      return `${baseUrl}/${item}`;
    }
  }

  const queryString = params.toString();
  if (queryString) {
    return `${baseUrl}?${queryString}`;
  }

  return baseUrl;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = buildUrl(queryKey);
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
