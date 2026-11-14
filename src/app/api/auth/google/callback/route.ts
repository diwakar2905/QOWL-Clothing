import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, OAUTH_COOKIE, openState } from "@/server/auth/google";
import { signInWithGoogle } from "@/server/services/auth";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { safeEqual } from "@/lib/crypto";
import { clientIp, userAgent } from "@/server/request";

const KNOWN_ERRORS = new Set(["GOOGLE_EMAIL_UNVERIFIED", "STAFF_GOOGLE", "GOOGLE_MISMATCH", "ACCOUNT_DISABLED", "RATE_LIMITED"]);

/** Google redirects here with ?code&state. Verifies state, exchanges the code and signs the customer in. */
export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? req.url;
  const sp = req.nextUrl.searchParams;
  const s = openState(req.cookies.get(OAUTH_COOKIE)?.value);
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}${s ? `&next=${encodeURIComponent(s.next)}` : ""}`, base));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
    return res;
  };

  if (sp.get("error")) return fail(sp.get("error") === "access_denied" ? "google_cancelled" : "google_failed");
  const code = sp.get("code");
  const state = sp.get("state");
  if (!s || !code || !state || !safeEqual(state, s.state)) return fail("google_expired");

  try {
    const identity = await exchangeCode(code, s);
    await signInWithGoogle(identity, { ip: await clientIp(), userAgent: await userAgent() });
  } catch (e) {
    const known = e instanceof AppError && KNOWN_ERRORS.has(e.code);
    if (!known) logger.error("auth.google_failed", { e });
    return fail(known ? (e as AppError).code.toLowerCase() : "google_failed");
  }
  const res = NextResponse.redirect(new URL(s.next, base));
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
  res.headers.set("cache-control", "no-store");
  return res;
}
