import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { address, asShopper, level, makeVariant } from "../support/factory";
import { addItem, getCartView } from "@/server/services/cart";
import { placeOrder } from "@/server/services/checkout";
import { confirmCheckoutPayment } from "@/server/services/payments";
import { finalizePaidOrder, getOrderForAccess, orderAccessToken, orderLink } from "@/server/services/orders";
import { createRefund, reconcilePendingRefunds } from "@/server/services/refunds";
import { requestReturn } from "@/server/services/returns";
import { getGateway, MockGateway, __setGateway } from "@/server/payments";
import { GatewayError } from "@/server/payments/gateway";

beforeEach(async () => { await asShopper(); });
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

async function pendingOrder(qty = 1) {
  const { variant } = await makeVariant(3);
  await addItem({ variantId: variant.id, quantity: qty });
  const v = await getCartView();
  const res = await placeOrder({ idempotencyKey: randomUUID(), email: `r-${randomUUID().slice(0, 8)}@example.com`, phone: phone(), address, paymentMethod: "ONLINE", acceptTerms: true, expectedTotal: v.pricing.grandTotal }, { ip: "t" });
  const order = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber }, include: { items: true } });
  return { res, order, variant };
}

describe("review fixes", () => {
  it("an amount mismatch puts the order on hold and releases the stock hold", async () => {
    const { res, order, variant } = await pendingOrder(1);
    const payId = `mockpay_${randomUUID()}`;
    expect((await level(variant.id)).reserved).toBe(1);
    await finalizePaidOrder({ orderId: order.id, providerPaymentId: payId, providerOrderId: res.payment!.providerOrderId, amount: order.grandTotal - 100, actor: { type: "WEBHOOK" } });
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([o.status, o.paymentStatus]).toEqual(["ON_HOLD", "PAID"]);
    expect((await level(variant.id)).reserved).toBe(0);
    // A later correct-amount event on an already-paid order is a no-op.
    const again = await finalizePaidOrder({ orderId: order.id, providerPaymentId: payId, providerOrderId: res.payment!.providerOrderId, amount: order.grandTotal, actor: { type: "WEBHOOK" } });
    expect(again.alreadyFinal).toBe(true);
  });

  it("a refund whose gateway call times out stays pending, blocks double refunds, then reconciles", async () => {
    const { res, order } = await pendingOrder(1);
    const sim = await (getGateway() as MockGateway).simulate(res.payment!.providerOrderId, "success");
    await confirmCheckoutPayment({ providerOrderId: res.payment!.providerOrderId, providerPaymentId: sim.payment.id, signature: sim.signature });
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@qowl.test" } });
    const real = getGateway() as MockGateway;
    // Simulate: the provider processes the refund but our request times out.
    const flaky = Object.create(real) as MockGateway;
    flaky.refund = async (i) => {
      await real.refund(i);
      throw new GatewayError("Razorpay network error: timeout", undefined, true);
    };
    __setGateway(flaky);
    try {
      await expect(createRefund({ orderId: order.id, amount: order.grandTotal, reason: "test", method: "GATEWAY", idempotencyKey: randomUUID() }, admin.id)).rejects.toMatchObject({ code: "REFUND_PENDING" });
    } finally {
      __setGateway(real);
    }
    const pending = await db.refund.findFirstOrThrow({ where: { orderId: order.id } });
    expect(pending.status).toBe("PENDING");
    await expect(createRefund({ orderId: order.id, amount: 100, reason: "again", method: "GATEWAY", idempotencyKey: randomUUID() }, admin.id)).rejects.toMatchObject({ code: "REFUND_TOO_LARGE" });
    await db.refund.update({ where: { id: pending.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    await reconcilePendingRefunds();
    const settled = await db.refund.findUniqueOrThrow({ where: { id: pending.id } });
    expect(settled.status).toBe("PROCESSED");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("REFUNDED");
  });

  it("rejects return photos that aren't the customer's own uploads", async () => {
    const { order } = await pendingOrder(1);
    await db.order.update({ where: { id: order.id }, data: { status: "COMPLETED", paymentStatus: "PAID", fulfillmentStatus: "DELIVERED", deliveredAt: new Date() } });
    await expect(
      requestReturn(order.id, { type: "RETURN", reason: "Size too small", photoUrls: ["https://evil.example/pixel.gif"], items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] }, { type: "CUSTOMER", userId: null }),
    ).rejects.toMatchObject({ code: "INVALID_PHOTO" });
  });

  it("order email links grant guest access and are stable", async () => {
    const { order } = await pendingOrder(1);
    const link = new URL(orderLink(order));
    expect(link.pathname).toBe(`/orders/${order.number}`);
    expect(link.searchParams.get("t")).toBe(orderAccessToken(order.id));
    expect((await getOrderForAccess(order.number, { token: link.searchParams.get("t") }))?.id).toBe(order.id);
    expect(orderAccessToken(order.id)).toBe(orderAccessToken(order.id));
  });
});
