import type { NextConfig } from "next";

const mediaBase = process.env.MEDIA_PUBLIC_BASE_URL;
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [];
if (mediaBase) {
  const u = new URL(mediaBase);
  remotePatterns.push({ protocol: u.protocol.replace(":", "") as "https" | "http", hostname: u.hostname, pathname: `${u.pathname.replace(/\/$/, "")}/**` });
}

// Cloudinary (STORAGE_DRIVER=cloudinary): allow this account's delivery URLs.
const cloudName = (() => {
  try {
    return process.env.CLOUDINARY_URL ? new URL(process.env.CLOUDINARY_URL).hostname : "";
  } catch {
    return "";
  }
})();
if (cloudName) remotePatterns.push({ protocol: "https", hostname: "res.cloudinary.com", pathname: `/${cloudName}/image/upload/**` });

const isProd = process.env.NODE_ENV === "production";

// Search indexing: only the production host (APP_URL) may be indexed. Vercel
// preview URLs, staging and any other host get X-Robots-Tag: noindex, which —
// unlike a robots.txt Disallow — also keeps already-discovered URLs out of results.
const appHost = (() => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).host : "";
  } catch {
    return "";
  }
})();
const blockAllIndexing = process.env.ALLOW_INDEXING === "false" || (!!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") || !appHost;
const NOINDEX = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
const noindexRules: { source: string; headers: { key: string; value: string }[]; missing?: { type: "host"; value: string }[] }[] = blockAllIndexing
  ? [{ source: "/:path*", headers: NOINDEX }]
  : [{ source: "/:path*", missing: [{ type: "host", value: appHost.replace(/\./g, "\\.") }], headers: NOINDEX }];

// Content Security Policy. Razorpay Checkout requires its script, frame and API
// origins. 'unsafe-inline' for scripts is needed by Next's inline bootstrap
// without per-request nonces (which would force every page to render
// dynamically); all user content is rendered as escaped text, never raw HTML.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${mediaBase ? " " + new URL(mediaBase).origin : ""}${cloudName ? " https://res.cloudinary.com" : ""} https://*.razorpay.com`,
  "font-src 'self' data:",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.razorpay.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\")" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "sharp", "pg"],
  images: {
    remotePatterns,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    minimumCacheTTL: 3600,
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  // Crawlers get fully-resolved <head> metadata and the final status code (e.g. a real
  // 404 for a removed product) instead of a streamed response that starts as 200.
  htmlLimitedBots: /Googlebot|Google-InspectionTool|Storebot-Google|AdsBot-Google|bingbot|BingPreview|DuckDuckBot|YandexBot|Baiduspider|Applebot|OAI-SearchBot|ChatGPT-User|PerplexityBot|Perplexity-User|Claude-SearchBot|Claude-User|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot/i,
  async redirects() {
    // Common brand-page paths people (and crawlers) guess.
    const brandPaths = [
      { source: "/about", destination: "/our-story", permanent: true },
      { source: "/about-us", destination: "/our-story", permanent: true },
      { source: "/contact-us", destination: "/contact", permanent: true },
    ];
    // Production only: send pages on *.vercel.app aliases (e.g. qowlclothing.vercel.app)
    // to the custom domain so search engines consolidate on one host. Only once APP_URL
    // is the custom domain (no loop), and never for /api/* — payment/shipping webhooks
    // and cron may still call the old host and don't follow redirects.
    const canonicalOrigin = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
    const toCustomDomain =
      process.env.VERCEL_ENV === "production" && appHost && !appHost.endsWith(".vercel.app") && !/^(localhost|127\.)/.test(appHost)
        ? [{ source: "/:path((?!api/).*)", has: [{ type: "host" as const, value: ".*\\.vercel\\.app" }], destination: `${canonicalOrigin}/:path`, permanent: true }]
        : [];
    return [...toCustomDomain, ...brandPaths];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...noindexRules,
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/account/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
