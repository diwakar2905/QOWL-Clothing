import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { address, asShopper, level, makeVariant } from "../support/factory";
import { addItem, getCartView, applyCoupon } from "@/server/services/cart";
import { placeOrder } from "@/server/services/checkout";
import { confirmCheckoutPayment, handlePaymentWebhook, reconcileOrderPayments } from "@/server/services/payments";
import { expireOrder, cancelOrder } from "@/server/services/orders";
import { reserve } from "@/server/services/inventory";
import { createRefund } from "@/server/services/refunds";
import { getGateway, MockGateway } from "@/server/payments";
import { saveSetting } from "@/server/services/settings";

const uniq = () => randomUUID().slice(0, 8);
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

const gw = () => getGateway() as MockGateway;
async function checkout(variantId: string, qty = 1, extra: Partial<Parameters<typeof placeOrder>[0]> = {}) {
  await addItem({ variantId, quantity: qty });
  const view = await getCartView();
  return placeOrder({ idempotencyKey: randomUUID(), email: `buyer-${uniq()}@example.com`, phone: phone(), address, paymentMethod: "ONLINE", acceptTerms: true, expectedTotal: view.pricing.grandTotal, ...extra }, { ip: "test" });
}
async function pay(providerOrderId: string, outcome: "success" | "failure") {
  const r = await gw().simulate(providerOrderId, outcome);
  return confirmCheckoutPayment({ providerOrderId, providerPaymentId: r.payment.id, signature: r.signature });
}

beforeEach(async () => { await asShopper(); });

describe("guest checkout with online payment", () => {
  it("reserves stock, confirms on verified payment, commits stock and empties the bag", async () => {
    const { variant } = await makeVariant(5);
    const res = await checkout(variant.id, 2);
    expect(res.payment?.provider).toBe("mock");
    let lv = await level(variant.id);
    expect([lv.onHand, lv.reserved]).toEqual([5, 2]);
    expect((await pay(res.payment!.providerOrderId, "success")).status).toBe("paid");
    const order = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber }, include: { items: true } });
    expect(order.status).toBe("CONFIRMED");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.items[0]!.unitPrice).toBe(100000);
    lv = await level(variant.id);
    expect([lv.onHand, lv.reserved, lv.committed]).toEqual([3, 0, 2]);
    expect((await getCartView()).items).toHaveLength(0);
    expect(await db.notificationOutbox.count({ where: { dedupeKey: `order_confirmed:${order.id}` } })).toBe(1);
  });

  it("rejects a forged checkout signature", async () => {
    const { variant } = await makeVariant(2);
    const res = await checkout(variant.id);
    await expect(confirmCheckoutPayment({ providerOrderId: res.payment!.providerOrderId, providerPaymentId: "mockpay_x__1", signature: "f".repeat(64) })).rejects.toThrow(/verify/);
    expect((await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } })).status).toBe("PENDING_PAYMENT");
  });

  it("is idempotent: the same key returns the same order", async () => {
    const { variant } = await makeVariant(3);
    await addItem({ variantId: variant.id, quantity: 1 });
    const view = await getCartView();
    const input = { idempotencyKey: randomUUID(), email: "dup@example.com", phone: "9876543210", address, paymentMethod: "ONLINE" as const, acceptTerms: true as const, expectedTotal: view.pricing.grandTotal };
    const a = await placeOrder(input, { ip: "t" });
    const b = await placeOrder(input, { ip: "t" });
    expect(b.orderNumber).toBe(a.orderNumber);
    expect(await db.order.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    expect((await level(variant.id)).reserved).toBe(1);
  });

  it("refuses when the displayed total no longer matches", async () => {
    const { variant } = await makeVariant(3);
    await expect(checkout(variant.id, 1, { expectedTotal: 1 })).rejects.toMatchObject({ code: "TOTAL_CHANGED" });
  });
});

describe("payment failures and expiry", () => {
  it("marks failure, keeps the hold for retry, then releases stock on expiry", async () => {
    const { variant } = await makeVariant(1);
    const res = await checkout(variant.id);
    expect((await pay(res.payment!.providerOrderId, "failure")).status).toBe("failed");
    const o = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } });
    expect(o.status).toBe("PAYMENT_FAILED");
    expect((await level(variant.id)).reserved).toBe(1);
    expect(await expireOrder(o.id)).toBe(true);
    expect(await expireOrder(o.id)).toBe(false); // idempotent
    expect((await level(variant.id)).reserved).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("EXPIRED");
  });

  it("puts a late capture on hold when the expired stock has since sold", async () => {
    const { variant } = await makeVariant(1);
    const first = await checkout(variant.id);
    const o = await db.order.findUniqueOrThrow({ where: { number: first.orderNumber } });
    await expireOrder(o.id);
    await asShopper();
    const second = await checkout(variant.id);
    await pay(second.payment!.providerOrderId, "success");
    await gw().simulate(first.payment!.providerOrderId, "success");
    await reconcileOrderPayments(o.id);
    const late = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(late.paymentStatus).toBe("PAID");
    expect(late.status).toBe("ON_HOLD");
    const lv = await level(variant.id);
    expect(lv.onHand).toBe(0);
    expect(lv.committed).toBe(1);
  });
});

describe("webhooks", () => {
  it("processes a duplicated webhook exactly once", async () => {
    const { variant } = await makeVariant(4);
    const res = await checkout(variant.id);
    const sim = await gw().simulate(res.payment!.providerOrderId, "success");
    const body = JSON.stringify({ event: "payment.captured", payment: sim.payment });
    const headers = new Headers({ "x-mock-event-id": `evt_${randomUUID()}` });
    const sig = gw().sign(body);
    expect((await handlePaymentWebhook("mock", body, headers, sig)).duplicate).toBe(false);
    expect((await handlePaymentWebhook("mock", body, headers, sig)).duplicate).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } });
    expect(o.status).toBe("CONFIRMED");
    expect(await db.inventoryMovement.count({ where: { orderId: o.id, type: "SALE" } })).toBe(1);
    expect((await level(variant.id)).committed).toBe(1);
  });
  it("rejects unsigned webhooks", async () => {
    await expect(handlePaymentWebhook("mock", "{}", new Headers(), "bad")).rejects.toMatchObject({ status: 401 });
  });
});

describe("inventory concurrency", () => {
  it("never oversells the last unit under concurrent reservations", async () => {
    const { variant } = await makeVariant(1);
    const orders = await Promise.all([0, 1, 2, 3, 4].map(async (i) => {
      return db.order.create({ data: { number: `CONC-${randomUUID().slice(0, 8)}-${i}`, email: "c@example.com", phone: "9876543210", customerName: "C", shippingAddress: {}, subtotal: 0, taxTotal: 0, grandTotal: 0, taxBreakdown: {}, idempotencyKey: randomUUID(), accessTokenHash: "x", termsAcceptedAt: new Date() } });
    }));
    const results = await Promise.allSettled(orders.map((o) => db.$transaction((tx) => reserve(tx, o.id, [{ variantId: variant.id, quantity: 1 }], 30))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await level(variant.id)).reserved).toBe(1);
  });

  it("blocks adding out-of-stock variants and quantities beyond stock", async () => {
    const { variant } = await makeVariant(0);
    await expect(addItem({ variantId: variant.id, quantity: 1 })).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    const { variant: v2 } = await makeVariant(2);
    await expect(addItem({ variantId: v2.id, quantity: 3 })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("database constraints reject negative inventory", async () => {
    const { variant } = await makeVariant(1);
    await expect(db.inventoryLevel.update({ where: { variantId: variant.id }, data: { onHand: -1 } })).rejects.toThrow();
  });
});

describe("coupons", () => {
  it("applies a server-validated discount and honours first-order rules", async () => {
    const email = `first-${uniq()}@example.com`;
    const { variant } = await makeVariant(5, { price: 200000 });
    await addItem({ variantId: variant.id, quantity: 1 });
    await applyCoupon("welcome10");
    const v = await getCartView();
    expect(v.pricing.discountTotal).toBe(20000);
    const res = await placeOrder({ idempotencyKey: randomUUID(), email, phone: "9876543210", address, paymentMethod: "ONLINE", acceptTerms: true, expectedTotal: v.pricing.grandTotal }, { ip: "t" });
    await pay(res.payment!.providerOrderId, "success");
    const o = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber }, include: { couponRedemption: true } });
    expect(o.discountTotal).toBe(20000);
    expect(o.couponRedemption?.status).toBe("COMMITTED");
    await asShopper();
    await addItem({ variantId: variant.id, quantity: 1 });
    await applyCoupon("WELCOME10"); // no identity yet → allowed at bag level
    const v2 = await getCartView();
    await expect(placeOrder({ idempotencyKey: randomUUID(), email, phone: "9876543210", address, paymentMethod: "ONLINE", acceptTerms: true, expectedTotal: v2.pricing.grandTotal }, { ip: "t" })).rejects.toMatchObject({ code: "COUPON_REJECTED" });
  });
  it("rejects unknown codes", async () => {
    const { variant } = await makeVariant(1);
    await addItem({ variantId: variant.id, quantity: 1 });
    await expect(applyCoupon("NOPE")).rejects.toMatchObject({ code: "COUPON_REJECTED" });
  });
});

describe("COD", () => {
  it("commits stock immediately and is refused when disabled", async () => {
    const { variant } = await makeVariant(2);
    const res = await checkout(variant.id, 1, { paymentMethod: "COD", phone: phone() });
    expect(res.payment).toBeNull();
    const o = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } });
    expect([o.status, o.paymentStatus]).toEqual(["CONFIRMED", "COD_PENDING"]);
    expect((await level(variant.id)).committed).toBe(1);
    const prev = await db.siteSetting.findUniqueOrThrow({ where: { key: "payments" } });
    await saveSetting("payments", { ...(prev.value as object), codEnabled: false });
    await asShopper();
    await expect(checkout(variant.id, 1, { paymentMethod: "COD", phone: phone() })).rejects.toMatchObject({ code: "COD_UNAVAILABLE" });
    await db.siteSetting.update({ where: { key: "payments" }, data: { value: prev.value as object } });
  });
});

describe("refunds and cancellation", () => {
  it("cancels a paid order, restores stock, and refunds through the gateway once", async () => {
    const { variant } = await makeVariant(3);
    const res = await checkout(variant.id, 2);
    await pay(res.payment!.providerOrderId, "success");
    const o = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber } });
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@qowl.test" } });
    const c = await cancelOrder(o.id, { type: "ADMIN", id: admin.id }, "Customer request");
    expect(c.needsRefund).toBe(true);
    const lv = await level(variant.id);
    expect([lv.onHand, lv.committed]).toEqual([3, 0]);
    const key = `test:${randomUUID()}`;
    const r1 = await createRefund({ orderId: o.id, amount: o.grandTotal, reason: "Cancelled", method: "GATEWAY", idempotencyKey: key }, admin.id);
    const r2 = await createRefund({ orderId: o.id, amount: o.grandTotal, reason: "Cancelled", method: "GATEWAY", idempotencyKey: key }, admin.id);
    expect(r2.id).toBe(r1.id);
    expect(r1.status).toBe("PROCESSED");
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect([after.paymentStatus, after.refundedTotal]).toEqual(["REFUNDED", o.grandTotal]);
    await expect(createRefund({ orderId: o.id, amount: 100, reason: "extra", method: "GATEWAY", idempotencyKey: randomUUID() }, admin.id)).rejects.toMatchObject({ code: "NOT_REFUNDABLE" });
  });
});
