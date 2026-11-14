import "server-only";
import { NextResponse, after } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { InvalidTransitionError } from "@/domain/state-machines";
import { logger } from "@/lib/logger";

export type ApiError = { code: string; message: string; fields?: Record<string, string>; details?: unknown };
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function zodFields(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join(".") || "_";
    out[k] ??= i.message;
  }
  return out;
}

export function toApiError(e: unknown): { status: number; error: ApiError } {
  if (e instanceof ZodError) return { status: 422, error: { code: "VALIDATION", message: "Please check the highlighted fields.", fields: zodFields(e) } };
  if (e instanceof AppError) return { status: e.status, error: { code: e.code, message: e.message, details: e.details } };
  if (e instanceof InvalidTransitionError) return { status: 409, error: { code: "INVALID_TRANSITION", message: e.message } };
  logger.error("api.unhandled", { e });
  return { status: 500, error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } };
}

/** Uniform JSON envelope + error mapping for route handlers. */
export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data } satisfies ApiResponse<T>, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

/** Deliver queued notifications promptly after the response is sent (the cron job is the retry backstop). */
export function flushOutboxSoon() {
  try {
    after(async () => {
      const { processOutbox } = await import("@/server/notifications/outbox");
      await processOutbox(10).catch((e) => logger.warn("outbox.flush_failed", { e }));
    });
  } catch {
    /* outside a request scope (e.g. tests) */
  }
}

export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      const res = await fn(...args);
      flushOutboxSoon();
      return res;
    } catch (e) {
      const { status, error } = toApiError(e);
      return NextResponse.json({ ok: false, error } satisfies ApiResponse<never>, { status, headers: { "Cache-Control": "no-store" } });
    }
  };
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("PAYLOAD_TOO_LARGE", "Request too large", 413);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("BAD_JSON", "Malformed request body", 400);
  }
}

/** Result type for server actions used by forms. */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: ApiError };

export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    flushOutboxSoon();
    return { ok: true, data, message };
  } catch (e) {
    // Let Next.js redirect()/notFound() propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) throw e;
    return { ok: false, error: toApiError(e).error };
  }
}
