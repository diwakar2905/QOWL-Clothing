import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";
import { getGateway, getGatewayByName } from "@/server/payments";
import type { GatewayPayment, NormalisedEvent } from "@/server/payments/gateway";
import { finalizePaidOrder, markPaymentFailed, type Actor } from "./orders";
import { applyGatewayRefundUpdate } from "./refunds";

/** Creates (or reuses) the gateway order for a pending online order. */
export async function ensureGatewayOrder(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "desc" } } } });
  const gateway = getGateway();
  const existing = order.payments.find((p) => p.provider === gateway.name && p.status === "CREATED" && p.amount === order.grandTotal);
  if (existing?.providerOrderId) return existing;
  const g = await gateway.createOrder({ amount: order.grandTotal, currency: "INR", receipt: order.number, notes: { order_number: order.number } });
  return db.payment.create({ data: { orderId: order.id, provider: gateway.name, providerOrderId: g.id, amount: order.grandTotal, currency: "INR" } });
}

async function applyGatewayPayment(p: GatewayPayment, actor: Actor) {
  const payment = await db.payment.findUnique({ where: { providerOrderId: p.orderId } });
  if (!payment) {
    logger.warn("payment.unknown_order", { providerOrderId: p.orderId });
    return { status: "unknown" as const };
  }
  if (p.status === "authorized") {
    // Orders are created with auto-capture; capture defensively if needed.
    p = await getGateway().capture(p.id, p.amount);
  }
  if (p.status === "captured") {
    const r = await finalizePaidOrder({ orderId: payment.orderId, providerPaymentId: p.id, providerOrderId: p.orderId, amount: p.amount, method: p.method, actor });
    return { status: r.onHold ? ("on_hold" as const) : ("paid" as const), orderId: payment.orderId };
  }
  if (p.status === "failed") {
    await markPaymentFailed({ orderId: payment.orderId, providerOrderId: p.orderId, providerPaymentId: p.id, errorCode: p.errorCode, errorDescription: p.errorDescription, actor });
    return { status: "failed" as const, orderId: payment.orderId };
  }
  return { status: "pending" as const, orderId: payment.orderId };
}

/**
 * Called by the browser after the hosted checkout returns. The signature
 * proves the response came from the gateway; we still fetch the payment
 * server-side and never trust client-reported success alone.
 */
export async function confirmCheckoutPayment(input: { providerOrderId: string; providerPaymentId: string; signature: string }) {
  const gateway = getGateway();
  if (!gateway.verifyCheckoutSignature({ orderId: input.providerOrderId, paymentId: input.providerPaymentId, signature: input.signature })) {
    logger.warn("payment.bad_checkout_signature", { providerOrderId: input.providerOrderId });
    throw new AppError("SIGNATURE_INVALID", "We couldn't verify this payment. If you were charged, it will be reconciled automatically.", 400);
  }
  const p = await gateway.fetchPayment(input.providerPaymentId);
  if (p.orderId !== input.providerOrderId) throw new AppError("PAYMENT_MISMATCH", "Payment does not match this order.", 400);
  return applyGatewayPayment(p, { type: "CUSTOMER" });
}

/** Customer dismissed/failed checkout: record the failure if the gateway confirms it. */
export async function reportCheckoutFailure(providerOrderId: string) {
  const payment = await db.payment.findUnique({ where: { providerOrderId } });
  if (!payment) return;
  return reconcileOrderPayments(payment.orderId);
}

/** Ask the gateway for the truth about an order's payments. */
export async function reconcileOrderPayments(orderId: string) {
  const payments = await db.payment.findMany({ where: { orderId, providerOrderId: { not: null }, status: { in: ["CREATED", "AUTHORIZED", "FAILED"] } } });
  const gateway = getGateway();
  let outcome: Awaited<ReturnType<typeof applyGatewayPayment>> | null = null;
  for (const pay of payments) {
    if (pay.provider !== gateway.name) continue;
    const list = await gateway.fetchOrderPayments(pay.providerOrderId!);
    const captured = list.find((x) => x.status === "captured" || x.status === "authorized");
    const latest = captured ?? list[list.length - 1];
    if (latest) outcome = await applyGatewayPayment(latest, { type: "SYSTEM" });
  }
  return outcome;
}

/** Periodic job: reconcile orders still awaiting payment confirmation. */
export async function reconcilePendingPayments(limit = 50) {
  const orders = await db.order.findMany({
    where: {
      paymentMethod: "ONLINE",
      placedAt: { lt: new Date(Date.now() - 2 * 60_000) },
      OR: [
        { status: { in: ["PENDING_PAYMENT", "PAYMENT_FAILED"] }, placedAt: { gt: new Date(Date.now() - 3 * 86400_000) } },
        // Expired holds are only re-checked for a day (catches late captures; webhooks cover the rest).
        { status: "EXPIRED", placedAt: { gt: new Date(Date.now() - 86400_000) } },
      ],
    },
    select: { id: true },
    take: limit,
    // Newest first so a backlog of abandoned checkouts can't starve recent orders.
    orderBy: { placedAt: "desc" },
  });
  let n = 0;
  for (const o of orders) {
    try {
      const r = await reconcileOrderPayments(o.id);
      if (r && r.status !== "pending") n++;
    } catch (e) {
      logger.warn("payment.reconcile_failed", { orderId: o.id, e });
    }
  }
  return n;
}

/**
 * Webhook processing with signature verification and exactly-once handling:
 * the (provider, eventId) unique key rejects duplicate deliveries, and
 * downstream handlers are idempotent anyway.
 */
export async function handlePaymentWebhook(providerName: string, rawBody: string, headers: Headers, signatureHeader: string | null) {
  const gateway = getGatewayByName(providerName);
  if (!gateway) throw new AppError("UNKNOWN_PROVIDER", "Unknown payment provider", 404);
  if (!gateway.verifyWebhook(rawBody, signatureHeader)) {
    logger.warn("webhook.bad_signature", { provider: providerName });
    throw new AppError("SIGNATURE_INVALID", "Invalid signature", 401);
  }
  let event: NormalisedEvent;
  try {
    event = gateway.parseWebhook(rawBody, headers);
  } catch {
    throw new AppError("BAD_PAYLOAD", "Malformed payload", 400);
  }
  let record;
  try {
    record = await db.paymentEvent.create({
      data: { provider: providerName, eventId: event.eventId, eventType: event.kind === "ignored" ? event.type : event.kind, payload: JSON.parse(rawBody) as Prisma.InputJsonValue, signatureValid: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const existing = await db.paymentEvent.findUnique({ where: { provider_eventId: { provider: providerName, eventId: event.eventId } } });
      if (existing?.processedAt) return { duplicate: true };
      record = existing!;
    } else throw e;
  }
  try {
    if (event.kind === "payment.captured" || event.kind === "payment.authorized" || event.kind === "order.paid" || event.kind === "payment.failed") {
      await applyGatewayPayment(event.payment, { type: "WEBHOOK" });
    } else if (event.kind === "refund.processed" || event.kind === "refund.failed") {
      await applyGatewayRefundUpdate(event.refund);
    }
    await db.paymentEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), error: null } });
    return { duplicate: false };
  } catch (e) {
    await db.paymentEvent.update({ where: { id: record.id }, data: { error: String((e as Error).message).slice(0, 500) } });
    throw e; // non-2xx makes the gateway retry
  }
}
