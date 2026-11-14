import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF defence for cookie-authenticated JSON endpoints: state-changing API
 * requests must come from our own origin. Webhooks and the cron endpoint
 * authenticate with signatures/secrets instead and are exempt.
 * (Server Actions have Next.js' built-in origin check.)
 */
const EXEMPT = [/^\/api\/webhooks\//, /^\/api\/cron\//, /^\/api\/health$/];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !EXEMPT.some((r) => r.test(pathname))) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let ok = false;
    if (origin && host) {
      try {
        ok = new URL(origin).host === host;
      } catch {
        ok = false;
      }
    }
    if (!ok) return NextResponse.json({ ok: false, error: { code: "CSRF", message: "Cross-site request blocked." } }, { status: 403 });
    const ct = req.headers.get("content-type") ?? "";
    if (req.headers.get("content-length") !== "0" && !ct.includes("application/json") && req.method !== "DELETE") {
      return NextResponse.json({ ok: false, error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "JSON required" } }, { status: 415 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
