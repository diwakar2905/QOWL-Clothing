import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { address, asShopper, level, makeVariant, resetCookies } from "../support/factory";
import { testCookies } from "../support/integration-setup";
import { addItem, getCartView } from "@/server/services/cart";
import { placeOrder } from "@/server/services/checkout";
import { confirmCheckoutPayment } from "@/server/services/payments";
import { createShipment, adminRecordShipmentStatus } from "@/server/services/fulfillment";
import { requestReturn, transitionReturn, inspectReturn, refundReturn, suggestedRefund } from "@/server/services/returns";
import { adjustStock } from "@/server/services/inventory";
import { getOrderForAccess } from "@/server/services/orders";
import { requirePermission } from "@/server/auth/session";
import { login } from "@/server/services/auth";
import { getGateway, MockGateway } from "@/server/payments";

beforeEach(async () => { await asShopper(); });

async function deliveredOrder(qty = 2) {
  const { variant } = await makeVariant(5);
  await addItem({ variantId: variant.id, quantity: qty });
  const v = await getCartView();
  const res = await placeOrder({ idempotencyKey: randomUUID(), email: `ret-${randomUUID().slice(0, 8)}@example.com`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, address, paymentMethod: "ONLINE", acceptTerms: true, expectedTotal: v.pricing.grandTotal }, { ip: "t" });
  const sim = await (getGateway() as MockGateway).simulate(res.payment!.providerOrderId, "success");
  await confirmCheckoutPayment({ providerOrderId: res.payment!.providerOrderId, providerPaymentId: sim.payment.id, signature: sim.signature });
  const order = await db.order.findUniqueOrThrow({ where: { number: res.orderNumber }, include: { items: true } });
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@qowl.test" } });
  const actor = { type: "ADMIN" as const, id: admin.id };
  const s = await createShipment(order.id, { mode: "manual", courierName: "Test Courier", awb: `AWB${Date.now()}` }, actor);
  await adminRecordShipmentStatus(s.id, "SHIPPED", undefined, actor);
  await adminRecordShipmentStatus(s.id, "DELIVERED", undefined, actor);
  return { order, variant, actor, token: res.accessToken };
}

describe("fulfilment and returns", () => {
  it("ships, delivers, and runs return → inspection → restock → refund", async () => {
    const { order, variant, actor } = await deliveredOrder(2);
    let o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([o.fulfillmentStatus, o.status]).toEqual(["DELIVERED", "COMPLETED"]);
    expect((await level(variant.id)).committed).toBe(0);

    const rr = await requestReturn(order.id, { type: "RETURN", reason: "Size too small", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] }, { type: "CUSTOMER" });
    await expect(requestReturn(order.id, { type: "RETURN", reason: "Size too small", items: [{ orderItemId: order.items[0]!.id, quantity: 2 }] }, { type: "CUSTOMER" })).rejects.toMatchObject({ code: "INVALID_QTY" });
    await expect(inspectReturn(rr.id, { items: [] }, actor)).rejects.toThrow(); // must be received first
    await transitionReturn(rr.id, "APPROVED", actor);
    await transitionReturn(rr.id, "RECEIVED", actor);
    let lv = await level(variant.id);
    expect([lv.onHand, lv.returnedPending]).toEqual([3, 1]); // quarantined, not restocked
    const item = await db.returnItem.findFirstOrThrow({ where: { returnRequestId: rr.id } });
    await inspectReturn(rr.id, { items: [{ returnItemId: item.id, restock: 1, damaged: 0 }] }, actor);
    lv = await level(variant.id);
    expect([lv.onHand, lv.returnedPending]).toEqual([4, 0]);
    const amount = await suggestedRefund(rr.id);
    expect(amount).toBe(100000);
    const refund = await refundReturn(rr.id, { amount, method: "GATEWAY", idempotencyKey: randomUUID() }, actor);
    expect(refund.status).toBe("PROCESSED");
    o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([o.paymentStatus, o.refundedTotal]).toEqual(["PARTIALLY_REFUNDED", 100000]);
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: rr.id } })).status).toBe("COMPLETED");
  });

  it("stock adjustments cannot go negative or below reserved units", async () => {
    const { variant } = await makeVariant(2);
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@qowl.test" } });
    await expect(adjustStock({ variantId: variant.id, type: "ADJUSTMENT", quantity: -3, reason: "test", actorId: admin.id })).rejects.toMatchObject({ code: "NEGATIVE_STOCK" });
    await adjustStock({ variantId: variant.id, type: "RESTOCK", quantity: 10, reason: "batch", actorId: admin.id });
    await adjustStock({ variantId: variant.id, type: "CORRECTION", quantity: 7, reason: "count", actorId: admin.id });
    expect((await level(variant.id)).onHand).toBe(7);
    expect(await db.inventoryMovement.count({ where: { variantId: variant.id } })).toBe(2);
  });
});

describe("access control", () => {
  it("guest order access requires the secret token (no IDOR by order number)", async () => {
    const { order, token } = await deliveredOrder(1);
    expect(await getOrderForAccess(order.number, { token: "wrong" })).toBeNull();
    expect(await getOrderForAccess(order.number, {})).toBeNull();
    expect((await getOrderForAccess(order.number, { token }))?.id).toBe(order.id);
  });

  it("enforces role permissions on the server", async () => {
    resetCookies();
    await expect(requirePermission("orders.refund")).rejects.toMatchObject({ status: 401 });
    await login({ email: "fulfillment@qowl.test", password: "QowlStaff#2026dev" }, { ip: "t" });
    expect(testCookies.size).toBeGreaterThan(0);
    await expect(requirePermission("orders.fulfill")).resolves.toBeTruthy();
    await expect(requirePermission("orders.refund")).rejects.toMatchObject({ status: 403 });
    await expect(requirePermission("staff.manage")).rejects.toMatchObject({ status: 403 });
    resetCookies();
    await login({ email: "customer@qowl.test", password: "QowlCustomer#2026" }, { ip: "t" });
    await expect(requirePermission("analytics.read")).rejects.toMatchObject({ status: 403 });
  });

  it("rejects bad passwords without revealing account existence", async () => {
    const a = await login({ email: "customer@qowl.test", password: "wrong-password-1" }, { ip: "t" }).catch((e) => e.message);
    const b = await login({ email: "nobody@example.com", password: "wrong-password-1" }, { ip: "t" }).catch((e) => e.message);
    expect(a).toBe(b);
  });
});
