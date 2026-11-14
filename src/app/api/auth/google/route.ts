import { NextResponse, type NextRequest } from "next/server";
import { authorizationUrl, googleConfig, newOAuthState, OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE, sealState } from "@/server/auth/google";
import { safeInternalPath } from "@/lib/utils";

/** Starts "Continue with Google": stores state + PKCE verifier in a signed cookie, then redirects to Google. */
export async function GET(req: NextRequest) {
  const next = safeInternalPath(req.nextUrl.searchParams.get("next"), "/account");
  if (!googleConfig()) return NextResponse.redirect(new URL(`/login?error=google_disabled`, process.env.APP_URL ?? req.url));
  const s = newOAuthState(next);
  const res = NextResponse.redirect(authorizationUrl(s));
  res.cookies.set(OAUTH_COOKIE, sealState(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax so the cookie comes back on Google's top-level redirect to the callback.
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
