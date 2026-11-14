"use client";

export type ClientApiError = { code: string; message: string; fields?: Record<string, string>; details?: unknown };
export class ApiCallError extends Error {
  constructor(public error: ClientApiError, public status: number) {
    super(error.message);
  }
}

/** JSON fetch helper for the storefront API with consistent error handling. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiCallError({ code: "NETWORK", message: navigator.onLine ? "We couldn't reach the server. Please try again." : "You appear to be offline. Check your connection and try again." }, 0);
  }
  let body: { ok: boolean; data?: T; error?: ClientApiError } | null = null;
  try {
    body = await res.json();
  } catch {
    throw new ApiCallError({ code: "BAD_RESPONSE", message: "Unexpected response from the server. Please try again." }, res.status);
  }
  if (!res.ok || !body?.ok) {
    if (res.status === 401) throw new ApiCallError(body?.error ?? { code: "UNAUTHORIZED", message: "Your session has expired. Please sign in again." }, 401);
    throw new ApiCallError(body?.error ?? { code: "ERROR", message: "Something went wrong." }, res.status);
  }
  return body.data as T;
}

export function uuid(): string {
  return crypto.randomUUID();
}
