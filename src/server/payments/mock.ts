import "server-only";
import { db } from "@/lib/db";
import { hmacSha256Hex, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { GatewayError, type GatewayPayment, type GatewayRefund, type NormalisedEvent, type PaymentGateway } from "./gateway";

/**
 * DEVELOPMENT/TEST ONLY gateway with Razorpay-compatible semantics: HMAC
 * checkout signatures, signed webhooks, capture and refunds. State is kept
 * in IdempotencyRecord rows (scope "mock_gateway"). Env validation forbids
 * this provider when NODE_ENV=production.
 */
type MockOrder = { id: string; amount: number; payments: GatewayPayment[]; refunds: GatewayRefund[] };

const key = (orderId: string) => `mockgw:${orderId}`;

async function load(orderId: string): Promise<MockOrder> {
  const rec = await db.idempotencyRecord.findUnique({ where: { key: key(orderId) } });
  if (!rec) throw new GatewayError("Mock order not found", 404);
  return rec.response as unknown as MockOrder;
}
async function save(o: MockOrder) {
  await db.idempotencyRecord.upsert({
    where: { key: key(o.id) },
    create: { key: key(o.id), scope: "mock_gateway", response: o as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 30 * 86400_000) },
    update: { response: o as unknown as Prisma.InputJsonValue },
  });
}
async function findByPayment(paymentId: string): Promise<MockOrder> {
  const orderId = paymentId.replace(/^mockpay_/, "").split("__")[0]!;
  return load(orderId);
}

export class MockGateway implements PaymentGateway {
  readonly name = "mock" as const;
  constructor(private secret: string) {}

  async createOrder(i: { amount: number }) {
    const id = `mockord_${randomToken(10).replace(/[-_]/g, "x")}`;
    await save({ id, amount: i.amount, payments: [], refunds: [] });
    return { id, amount: i.amount };
  }

  /** Simulates the customer completing/failing the hosted checkout. */
  async simulate(orderId: string, outcome: "success" | "failure") {
    const o = await load(orderId);
    const id = `mockpay_${orderId}__${o.payments.length + 1}`;
    const p: GatewayPayment = outcome === "success"
      ? { id, orderId, status: "captured", amount: o.amount, currency: "INR", method: "upi" }
      : { id, orderId, status: "failed", amount: o.amount, currency: "INR", method: "card", errorCode: "BAD_REQUEST_ERROR", errorDescription: "Payment declined by the test bank" };
    o.payments.push(p);
    await save(o);
    return { payment: p, signature: hmacSha256Hex(this.secret, `${orderId}|${id}`) };
  }

  verifyCheckoutSignature(i: { orderId: string; paymentId: string; signature: string }) {
    return !!i.signature && safeEqual(hmacSha256Hex(this.secret, `${i.orderId}|${i.paymentId}`), i.signature);
  }
  async fetchPayment(paymentId: string) {
    const p = (await findByPayment(paymentId)).payments.find((x) => x.id === paymentId);
    if (!p) throw new GatewayError("Mock payment not found", 404);
    return p;
  }
  async fetchOrderPayments(orderId: string) {
    return (await load(orderId)).payments;
  }
  async capture(paymentId: string) {
    const o = await findByPayment(paymentId);
    const p = o.payments.find((x) => x.id === paymentId)!;
    if (p.status === "authorized") p.status = "captured";
    await save(o);
    return p;
  }
  async refund(i: { paymentId: string; amount: number; receipt: string }) {
    const o = await findByPayment(i.paymentId);
    const already = o.refunds.filter((r) => r.paymentId === i.paymentId && r.status !== "failed").reduce((s, r) => s + r.amount, 0);
    if (already + i.amount > o.amount) throw new GatewayError("Refund exceeds captured amount", 400);
    const r: GatewayRefund = { id: `mockrfnd_${sha256(i.receipt).slice(0, 14)}`, paymentId: i.paymentId, amount: i.amount, status: "processed" };
    if (!o.refunds.some((x) => x.id === r.id)) o.refunds.push(r);
    await save(o);
    return r;
  }
  sign(rawBody: string) {
    return hmacSha256Hex(this.secret, rawBody);
  }
  verifyWebhook(rawBody: string, signature: string | null) {
    return !!signature && safeEqual(hmacSha256Hex(this.secret, rawBody), signature);
  }
  parseWebhook(rawBody: string, headers: Headers): NormalisedEvent {
    const body = JSON.parse(rawBody) as { event: string; payment?: GatewayPayment; refund?: GatewayRefund };
    const eventId = headers.get("x-mock-event-id") ?? `sha256:${sha256(rawBody)}`;
    if (body.payment && ["payment.captured", "payment.failed", "payment.authorized", "order.paid"].includes(body.event)) {
      return { kind: body.event as "payment.captured", eventId, payment: body.payment };
    }
    if (body.refund && ["refund.processed", "refund.failed", "refund.created"].includes(body.event)) {
      return { kind: body.event as "refund.processed", eventId, refund: body.refund };
    }
    return { kind: "ignored", eventId, type: body.event };
  }
  publicConfig() {
    return { provider: "mock" as const };
  }
}
