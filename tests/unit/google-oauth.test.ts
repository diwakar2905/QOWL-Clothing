import { describe, it, expect, beforeAll } from "vitest";
import { identityFromClaims, newOAuthState, openState, sealState, authorizationUrl } from "@/server/auth/google";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
  process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.APP_URL = "https://qowl.example";
});

const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: "client-123.apps.googleusercontent.com",
  exp: Math.floor(Date.now() / 1000) + 300,
  nonce: "n-1",
  sub: "1234567890",
  email: "Priya@Example.com",
  email_verified: true,
  name: "Priya Sharma",
  ...over,
});
const expectOk = { clientId: "client-123.apps.googleusercontent.com", nonce: "n-1" };

describe("Google ID token claims", () => {
  it("accepts a valid token and normalises the email", () => {
    expect(identityFromClaims(claims(), expectOk)).toEqual({ sub: "1234567890", email: "priya@example.com", name: "Priya Sharma" });
  });
  it.each([
    ["issuer", { iss: "https://evil.example" }],
    ["audience", { aud: "someone-else" }],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ["nonce", { nonce: "other" }],
    ["subject", { sub: "" }],
  ])("rejects a bad %s", (_why, over) => {
    expect(() => identityFromClaims(claims(over), expectOk)).toThrow();
  });
  it("rejects unverified Google emails", () => {
    expect(() => identityFromClaims(claims({ email_verified: false }), expectOk)).toThrow(/isn't verified/);
  });
});

describe("OAuth state cookie", () => {
  it("round-trips and rejects tampering", () => {
    const s = newOAuthState("/account/orders");
    const sealed = sealState(s);
    expect(openState(sealed)).toEqual(s);
    const [body, mac] = sealed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...s, next: "//evil.com" })).toString("base64url");
    expect(openState(`${forged}.${mac}`)).toBeNull();
    expect(openState(`${body}.${"0".repeat(64)}`)).toBeNull();
    expect(openState(undefined)).toBeNull();
  });
  it("builds a PKCE authorization URL with the callback redirect", () => {
    const u = new URL(authorizationUrl(newOAuthState("/account")));
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.searchParams.get("redirect_uri")).toBe("https://qowl.example/api/auth/google/callback");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("openid email profile");
  });
});
