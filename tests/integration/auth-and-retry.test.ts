import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { address, asShopper, level, makeVariant, resetCookies } from "../support/factory";
import { testCookies } from "../support/integration-setup";
import { register, login, verifyEmail, signInWithGoogle } from "@/server/services/auth";
import { hashPassword } from "@/server/auth/password";
import { randomToken } from "@/lib/crypto";
import { getCurrentUser } from "@/server/auth/session";
import { addItem, getCartView } from "@/server/services/cart";
import { placeOrder, replaceUnpaidOrder } from "@/server/services/checkout";
import { getGateway, MockGateway } from "@/server/payments";
import { AuthTokenType } from "@/generated/prisma/enums";

beforeEach(() => resetCookies());
const uniq = () => randomUUID().slice(0, 8);

describe("enumeration-safe registration", () => {
  it("responds identically for new and existing emails; existing owners are emailed instead", async () => {
    const fresh = `new-${uniq()}@example.com`;
    await expect(register({ name: "New Person", email: fresh, password: "a-good-password-1" }, { ip: "t" })).resolves.toBeUndefined();
    await expect(register({ name: "Someone", email: "customer@qowl.test", password: "a-good-password-1" }, { ip: "t" })).resolves.toBeUndefined();
    // Neither path signs anyone in.
    expect(testCookies.size).toBe(0);
    const existing = await db.user.findUniqueOrThrow({ where: { email: "customer@qowl.test" } });
    expect(await db.notificationOutbox.count({ where: { template: "account_exists", recipient: existing.email } })).toBeGreaterThan(0);
    const created = await db.user.findUniqueOrThrow({ where: { email: fresh } });
    expect(created.emailVerifiedAt).toBeNull();
  });

  it("confirming the email verifies the account and signs the customer in", async () => {
    const email = `verify-${uniq()}@example.com`;
    await register({ name: "Verify Me", email, password: "a-good-password-1" }, { ip: "t" });
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    // Issue a token we know (only hashes are stored).
    const token = randomToken(32);
    await db.authToken.create({ data: { userId: user.id, type: AuthTokenType.EMAIL_VERIFICATION, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } });
    await verifyEmail(token);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
    expect((await getCurrentUser())?.id).toBe(user.id);
    await expect(verifyEmail(token)).rejects.toMatchObject({ code: "TOKEN_INVALID" }); // single use
  });
});

describe("enumeration-safe lockout", () => {
  it("locks existing and non-existent emails after the same number of failures, with the same error", async () => {
    const prev = process.env.DISABLE_RATE_LIMIT;
    process.env.DISABLE_RATE_LIMIT = "false";
    try {
      const realEmail = `lock-${uniq()}@example.com`;
      await db.user.create({ data: { email: realEmail, passwordHash: await hashPassword("correct-horse-1") } });
      const ghost = `ghost-${uniq()}@example.com`;
      const attempt = (email: string): Promise<string> => login({ email, password: "wrong-password-1" }, { ip: `ip-${uniq()}` }).then(() => "signed-in", (e) => `${e.status}:${e.message}`);
      const real: string[] = [], fake: string[] = [];
      for (let i = 0; i < 11; i++) {
        real.push(await attempt(realEmail));
        fake.push(await attempt(ghost));
      }
      expect(real).toEqual(fake);
      expect(real[10]).toMatch(/^429:/);
      expect(real[9]).toMatch(/^401:/);
    } finally {
      process.env.DISABLE_RATE_LIMIT = prev;
    }
  });
});

describe("changing details after a failed payment", () => {
  async function unpaid() {
    await asShopper();
    const { variant } = await makeVariant(2);
    await addItem({ variantId: variant.id, quantity: 1 });
    const v = await getCartView();
    const res = await placeOrder({ idempotencyKey: randomUUID(), email: `x-${uniq()}@example.com`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, address, paymentMethod: "ONLINE", acceptTerms: true, expectedTotal: v.pricing.grandTotal }, { ip: "t" });
    return { res, variant };
  }

  it("releases a genuinely unpaid order and its stock", async () => {
    const { res, variant } = await unpaid();
    await (getGateway() as MockGateway).simulate(res.payment!.providerOrderId, "failure");
    expect((await level(variant.id)).reserved).toBe(1);
    const r = await replaceUnpaidOrder(res.orderNumber, res.accessToken, null);
    expect(r.status).toBe("released");
    expect((await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } })).status).toBe("EXPIRED");
    expect((await level(variant.id)).reserved).toBe(0);
  });

  it("detects a payment that succeeded meanwhile and does not release the order", async () => {
    const { res, variant } = await unpaid();
    await (getGateway() as MockGateway).simulate(res.payment!.providerOrderId, "success");
    const r = await replaceUnpaidOrder(res.orderNumber, res.accessToken, null);
    expect(r.status).toBe("paid");
    expect((await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } })).status).toBe("CONFIRMED");
    expect((await level(variant.id)).committed).toBe(1);
  });

  it("requires the order's access token", async () => {
    const { res } = await unpaid();
    await expect(replaceUnpaidOrder(res.orderNumber, "wrong", null)).rejects.toMatchObject({ status: 404 });
  });
});

describe("checkout requires sign-in", () => {
  it("refuses guests and staff, and accepts a signed-in customer", async () => {
    const { variant } = await makeVariant(2);
    await addItem({ variantId: variant.id, quantity: 1 });
    const v = await getCartView();
    const input = () => ({ idempotencyKey: randomUUID(), email: `gate-${uniq()}@example.com`, phone: "9876543210", address, paymentMethod: "ONLINE" as const, acceptTerms: true as const, expectedTotal: v.pricing.grandTotal });
    await expect(placeOrder(input(), { ip: "t" })).rejects.toMatchObject({ code: "LOGIN_REQUIRED", status: 401 });
    await login({ email: "admin@qowl.test", password: "QowlAdmin#2026dev" }, { ip: "t", staffOnly: true });
    await expect(placeOrder(input(), { ip: "t" })).rejects.toMatchObject({ code: "CUSTOMER_ACCOUNT_REQUIRED" });
    // A guest's bag survives signing in.
    resetCookies();
    await addItem({ variantId: variant.id, quantity: 1 });
    const shopper = await db.user.create({ data: { email: `gate-${uniq()}@example.com`, passwordHash: await hashPassword("a-good-password-1"), emailVerifiedAt: new Date() } });
    await login({ email: shopper.email, password: "a-good-password-1" }, { ip: "t" });
    const res = await placeOrder({ ...input(), expectedTotal: (await getCartView()).pricing.grandTotal }, { ip: "t" });
    expect((await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } })).userId).toBe(shopper.id);
  });
});

describe("Continue with Google", () => {
  const ctx = { ip: "t" };
  it("creates a verified account for a new Google user and signs them in", async () => {
    const email = `g-new-${uniq()}@gmail.com`;
    const sub = `sub-${uniq()}`;
    const u = await signInWithGoogle({ sub, email, name: "Google User" }, ctx);
    expect(u.googleId).toBe(sub);
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(u.passwordHash).toBeNull();
    expect((await getCurrentUser())?.id).toBe(u.id);
    resetCookies();
    expect((await signInWithGoogle({ sub, email, name: null }, ctx)).id).toBe(u.id); // same account next time
  });

  it("links a verified password account and keeps its password", async () => {
    const email = `g-link-${uniq()}@example.com`;
    const existing = await db.user.create({ data: { email, name: "Has Password", passwordHash: await hashPassword("a-good-password-1"), emailVerifiedAt: new Date() } });
    const u = await signInWithGoogle({ sub: `sub-${uniq()}`, email, name: "Ignored" }, ctx);
    expect(u.id).toBe(existing.id);
    expect(u.passwordHash).not.toBeNull();
    expect(u.name).toBe("Has Password");
  });

  it("removes the password of an unverified account before linking it", async () => {
    const email = `g-squat-${uniq()}@example.com`;
    const squatter = await db.user.create({ data: { email, passwordHash: await hashPassword("a-good-password-1") } });
    await db.session.create({ data: { userId: squatter.id, tokenHash: sha256(randomToken()), expiresAt: new Date(Date.now() + 3600_000) } });
    const u = await signInWithGoogle({ sub: `sub-${uniq()}`, email, name: "Real Owner" }, ctx);
    expect(u.id).toBe(squatter.id);
    expect(u.passwordHash).toBeNull();
    expect(u.emailVerifiedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: u.id } })).toBe(1); // only the new Google session
  });

  it("refuses staff accounts and a different Google account for a linked email", async () => {
    await expect(signInWithGoogle({ sub: `sub-${uniq()}`, email: "admin@qowl.test", name: null }, ctx)).rejects.toMatchObject({ code: "STAFF_GOOGLE" });
    const email = `g-two-${uniq()}@example.com`;
    await signInWithGoogle({ sub: `sub-a-${uniq()}`, email, name: null }, ctx);
    await expect(signInWithGoogle({ sub: `sub-b-${uniq()}`, email, name: null }, ctx)).rejects.toMatchObject({ code: "GOOGLE_MISMATCH" });
  });
});
