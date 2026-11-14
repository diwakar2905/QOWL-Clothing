import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { address, level, makeVariant, resetCookies } from "../support/factory";
import { testCookies } from "../support/integration-setup";
import { register, login, verifyEmail } from "@/server/services/auth";
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
