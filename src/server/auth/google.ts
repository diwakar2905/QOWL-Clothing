import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import { hmacSha256Hex, randomToken, safeEqual } from "@/lib/crypto";

/**
 * Google OpenID Connect (authorization code flow + PKCE), with no SDK.
 *
 * The ID token is taken straight from Google's token endpoint over TLS, so per
 * OIDC Core §3.1.3.7 the TLS connection authenticates the issuer and we don't
 * need to fetch Google's keys to check the signature. We still check every
 * claim we rely on: iss, aud, exp, nonce and email_verified.
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export const OAUTH_COOKIE = "qowl_google_oauth";
export const OAUTH_COOKIE_MAX_AGE = 600;

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/auth/google/callback` };
}

export const isGoogleEnabled = () => googleConfig() !== null;

export type OAuthState = { state: string; verifier: string; nonce: string; next: string };

const secret = () => process.env.SESSION_SECRET ?? "";

/** Signed so the `next` path and PKCE verifier can't be tampered with in the cookie. */
export function sealState(s: OAuthState): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${hmacSha256Hex(secret(), `google-oauth:${body}`)}`;
}

export function openState(raw: string | undefined): OAuthState | null {
  if (!raw || raw.length > 2000) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac || !safeEqual(mac, hmacSha256Hex(secret(), `google-oauth:${body}`))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as OAuthState;
    return typeof s.state === "string" && typeof s.verifier === "string" && typeof s.nonce === "string" && typeof s.next === "string" ? s : null;
  } catch {
    return null;
  }
}

export function newOAuthState(next: string): OAuthState {
  return { state: randomToken(24), verifier: randomToken(48), nonce: randomToken(24), next };
}

export function authorizationUrl(s: OAuthState): string {
  const cfg = googleConfig();
  if (!cfg) throw new AppError("GOOGLE_DISABLED", "Google sign-in is not configured.", 404);
  const challenge = createHash("sha256").update(s.verifier).digest("base64url");
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: s.state,
    nonce: s.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

export type GoogleIdentity = { sub: string; email: string; name: string | null };

/** Validates ID token claims. Exported for unit tests. */
export function identityFromClaims(c: Record<string, unknown>, expect: { clientId: string; nonce: string; now?: number }): GoogleIdentity {
  const bad = (why: string) => new AppError("GOOGLE_TOKEN_INVALID", `Google sign-in failed (${why}).`, 400);
  if (!ISSUERS.has(String(c.iss))) throw bad("issuer");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(expect.clientId)) throw bad("audience");
  const now = Math.floor((expect.now ?? Date.now()) / 1000);
  if (typeof c.exp !== "number" || c.exp < now - 60) throw bad("expired");
  if (typeof c.nonce !== "string" || !safeEqual(c.nonce, expect.nonce)) throw bad("nonce");
  if (typeof c.sub !== "string" || !c.sub) throw bad("subject");
  if (typeof c.email !== "string" || !c.email.includes("@")) throw bad("email");
  if (c.email_verified !== true && c.email_verified !== "true") {
    throw new AppError("GOOGLE_EMAIL_UNVERIFIED", "Your Google account's email isn't verified. Verify it with Google, or sign up with email instead.", 400);
  }
  const name = typeof c.name === "string" ? c.name.trim().slice(0, 80) || null : null;
  return { sub: c.sub, email: c.email.trim().toLowerCase(), name };
}

export async function exchangeCode(code: string, s: OAuthState): Promise<GoogleIdentity> {
  const cfg = googleConfig();
  if (!cfg) throw new AppError("GOOGLE_DISABLED", "Google sign-in is not configured.", 404);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      code_verifier: s.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new AppError("GOOGLE_EXCHANGE_FAILED", "Google sign-in failed. Please try again.", 502);
  const json = (await res.json()) as { id_token?: string };
  const payload = json.id_token?.split(".")[1];
  if (!payload) throw new AppError("GOOGLE_EXCHANGE_FAILED", "Google sign-in failed. Please try again.", 502);
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
  return identityFromClaims(claims, { clientId: cfg.clientId, nonce: s.nonce });
}
