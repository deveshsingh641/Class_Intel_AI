import { QueryClient, QueryFunction } from "@tanstack/react-query";

function getAuthToken(): string | null {
  return localStorage.getItem("token");
}

let apiBaseUrl: string | null = null;

export function getApiBaseUrl(): string {
  if (apiBaseUrl) return apiBaseUrl;
  
  let base = (import.meta as any).env?.VITE_API_URL as string | undefined;
  
  // Auto-detect backend API from current hostname if not configured
  if (!base) {
    if (typeof window !== "undefined") {
      const backendPort = (import.meta as any).env?.VITE_BACKEND_PORT || 5001;
      base = `http://${window.location.hostname}:${backendPort}`;
      if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        console.log(
          `🔗 Auto-detected backend API: ${base} (Your current IP: ${window.location.hostname})`
        );
      }
    } else {
      return "/api"; // Fallback for SSR or non-browser environments
    }
  } else {
    console.log(`🔗 Using configured backend API: ${base}`);
  }
  
  apiBaseUrl = base;
  return base;
}

export function withApiBase(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = getApiBaseUrl();
  
  if (!url.startsWith("/")) return `${base.replace(/\/$/, "")}/${url}`;
  return `${base.replace(/\/$/, "")}${url}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      const data = await res.json();
      errorMessage = data.error || data.message || errorMessage;
    } catch {
      errorMessage = await res.text() || errorMessage;
    }
    const err = new Error(errorMessage) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  url = withApiBase(url);

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = withApiBase(queryKey.join("/") as string);
    
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers,
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      // Enhance network errors with more context
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(`Failed to connect to server. Please ensure the server is running at ${url}`);
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        // Never retry 4xx client errors
        if ((error as any)?.status >= 400 && (error as any)?.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
