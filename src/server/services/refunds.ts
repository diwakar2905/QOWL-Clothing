import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { logger } from "@/lib/logger";
import { refundableAmount } from "@/domain/returns";
import { getGateway } from "@/server/payments";
import { GatewayError, type GatewayRefund } from "@/server/payments/gateway";
import { enqueueEmail } from "@/server/notifications/outbox";
import { lockOrder, orderLink, recordHistory } from "./orders";
import { audit } from "./audit";

export const refundInputSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
  method: z.enum(["GATEWAY", "MANUAL"]),
  manualReference: z.string().trim().max(120).optional(),
  returnRequestId: z.string().optional(),
  idempotencyKey: z.string().min(8).max(100),
});

/**
 * Issue a refund. GATEWAY refunds go through the payment provider and are
 * only counted as refunded once the provider reports `processed`. MANUAL
 * refunds (e.g. bank transfer for COD) require a verifiable reference.
 */
export async function createRefund(input: z.input<typeof refundInputSchema>, actorId: string) {
  const data = refundInputSchema.parse(input);
  const prior = await db.refund.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (prior) return prior;
  if (data.method === "MANUAL" && !data.manualReference) throw new AppError("REFERENCE_REQUIRED", "Enter the bank/UPI transaction reference for a manual refund.");

  let refund;
  try {
    refund = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, data.orderId);
    if (!["PAID", "PARTIALLY_REFUNDED", "COD_COLLECTED"].includes(order.paymentStatus)) {
      throw new AppError("NOT_REFUNDABLE", "Only paid orders can be refunded.", 409);
    }
    const pending = await tx.refund.aggregate({ where: { orderId: order.id, status: "PENDING" }, _sum: { amount: true } });
    const max = refundableAmount(order, pending._sum.amount ?? 0);
    if (data.amount > max) throw new AppError("REFUND_TOO_LARGE", `The maximum refundable amount is ${formatINR(max)}.`, 409);
    let paymentId: string | null = null;
    if (data.method === "GATEWAY") {
      if (order.paymentMethod === "COD") throw new AppError("MANUAL_ONLY", "COD orders must be refunded manually.", 409);
      const pay = await tx.payment.findFirst({ where: { orderId: order.id, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED"] } } });
      if (!pay?.providerPaymentId) throw new AppError("NO_PAYMENT", "No captured gateway payment found for this order.", 409);
      paymentId = pay.id;
    }
    const r = await tx.refund.create({
      data: {
        orderId: order.id,
        paymentId,
        returnRequestId: data.returnRequestId,
        amount: data.amount,
        reason: data.reason,
        method: data.method,
        manualReference: data.manualReference,
        idempotencyKey: data.idempotencyKey,
        initiatedById: actorId,
        status: "PENDING",
      },
    });
    await recordHistory(tx, order.id, "REFUND", null, `INITIATED ${formatINR(data.amount)}`, { type: "ADMIN", id: actorId }, data.reason);
    await audit({ actorId, action: "refund.create", entityType: "Order", entityId: order.id, after: { amount: data.amount, method: data.method, refundId: r.id } }, tx);
    return r;
    });
  } catch (e) {
    // Concurrent double-submit with the same key: return the refund that won.
    if ((e as { code?: string }).code === "P2002") return db.refund.findUniqueOrThrow({ where: { idempotencyKey: data.idempotencyKey } });
    throw e;
  }

  if (data.method === "MANUAL") {
    await markRefundProcessed(refund.id, data.manualReference ?? null);
    return db.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  // Gateway call happens outside the DB transaction; the row is our idempotency anchor.
  const payment = await db.payment.findUniqueOrThrow({ where: { id: refund.paymentId! } });
  try {
    const g = await getGateway().refund({ paymentId: payment.providerPaymentId!, amount: refund.amount, receipt: refund.id, notes: { order_id: refund.orderId, refund_id: refund.id } });
    await db.refund.update({ where: { id: refund.id }, data: { providerRefundId: g.id } });
    const order = await db.order.findUniqueOrThrow({ where: { id: refund.orderId } });
    await enqueueEmail({ template: "refund_initiated", to: order.email, vars: { name: order.customerName, orderNumber: order.number, amount: formatINR(refund.amount), link: orderLink(order) }, dedupeKey: `refund_initiated:${refund.id}` });
    if (g.status === "processed") await markRefundProcessed(refund.id, g.id);
    if (g.status === "failed") await markRefundFailed(refund.id, "Gateway reported failure");
  } catch (e) {
    logger.error("refund.gateway_failed", { refundId: refund.id, e });
    const definite = e instanceof GatewayError && e.status != null && e.status >= 400 && e.status < 500;
    if (definite) {
      await markRefundFailed(refund.id, (e as Error).message);
      throw new AppError("REFUND_FAILED", `The payment provider rejected the refund: ${(e as Error).message}`, 502);
    }
    // Outcome unknown (timeout/5xx): keep it PENDING so the amount stays reserved and
    // the reconciliation job can settle it — never risk refunding twice.
    await db.refund.update({ where: { id: refund.id }, data: { failureReason: `Outcome unknown, reconciling: ${(e as Error).message}`.slice(0, 300) } });
    throw new AppError("REFUND_PENDING", "The payment provider didn't respond. The refund is pending and will be reconciled automatically — don't retry it.", 502);
  }
  return db.refund.findUniqueOrThrow({ where: { id: refund.id } });
}

export async function markRefundProcessed(refundId: string, reference: string | null) {
  await db.$transaction(async (tx) => {
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    const order = await lockOrder(tx, r.orderId);
    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    if (fresh.status === "PROCESSED") return;
    await tx.refund.update({ where: { id: refundId }, data: { status: "PROCESSED", processedAt: new Date(), providerRefundId: fresh.providerRefundId ?? (r.method === "GATEWAY" ? reference : null) } });
    const refundedTotal = order.refundedTotal + r.amount;
    const full = refundedTotal >= order.grandTotal;
    const nextPay = full ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.order.update({ where: { id: order.id }, data: { refundedTotal, paymentStatus: nextPay } });
    if (order.paymentStatus !== nextPay) await recordHistory(tx, order.id, "PAYMENT", order.paymentStatus, nextPay, { type: "SYSTEM" });
    await recordHistory(tx, order.id, "REFUND", "PENDING", `PROCESSED ${formatINR(r.amount)}`, { type: "SYSTEM" });
    if (r.paymentId) await tx.payment.update({ where: { id: r.paymentId }, data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    if (r.returnRequestId) {
      const rr = await tx.returnRequest.findUnique({ where: { id: r.returnRequestId } });
      if (rr?.status === "REFUND_PENDING") await tx.returnRequest.update({ where: { id: rr.id }, data: { status: "COMPLETED" } });
    }
    await enqueueEmail(
      { template: "refund_completed", to: order.email, vars: { name: order.customerName, orderNumber: order.number, amount: formatINR(r.amount), reference: reference ? ` Reference: ${reference}.` : "", link: orderLink(order) }, dedupeKey: `refund_completed:${refundId}` },
      tx,
    );
  });
}

export async function markRefundFailed(refundId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    if (r.status !== "PENDING") return;
    await tx.refund.update({ where: { id: refundId }, data: { status: "FAILED", failureReason: reason.slice(0, 300) } });
    await recordHistory(tx, r.orderId, "REFUND", "PENDING", "FAILED", { type: "SYSTEM" }, reason);
  });
}

/** Job: settle gateway refunds whose outcome is unknown (e.g. the API call timed out). */
export async function reconcilePendingRefunds(limit = 25) {
  const pending = await db.refund.findMany({
    where: { status: "PENDING", method: "GATEWAY", createdAt: { lt: new Date(Date.now() - 2 * 60_000) } },
    include: { payment: true },
    take: limit,
  });
  let n = 0;
  for (const r of pending) {
    if (!r.payment?.providerPaymentId) continue;
    try {
      const list = await getGateway().listRefunds(r.payment.providerPaymentId);
      const match = list.find((g) => (r.providerRefundId && g.id === r.providerRefundId) || g.ref === r.id);
      if (!match) {
        // Provider never created it: safe to mark failed after a grace period.
        if (Date.now() - r.createdAt.getTime() > 30 * 60_000) await markRefundFailed(r.id, "Not found at payment provider");
        continue;
      }
      if (!r.providerRefundId) await db.refund.update({ where: { id: r.id }, data: { providerRefundId: match.id } });
      if (match.status === "processed") await markRefundProcessed(r.id, match.id);
      else if (match.status === "failed") await markRefundFailed(r.id, "Gateway reported failure");
      n++;
    } catch (e) {
      logger.warn("refund.reconcile_failed", { refundId: r.id, e });
    }
  }
  return n;
}

export async function applyGatewayRefundUpdate(g: GatewayRefund) {
  let r = await db.refund.findUnique({ where: { providerRefundId: g.id } });
  if (!r && g.ref) {
    // Webhook can beat our own write of the provider id (e.g. after an API timeout).
    r = await db.refund.findUnique({ where: { id: g.ref } });
    if (r && !r.providerRefundId) await db.refund.update({ where: { id: r.id }, data: { providerRefundId: g.id } });
  }
  if (!r) {
    logger.warn("refund.unknown", { providerRefundId: g.id });
    return;
  }
  if (g.status === "processed") await markRefundProcessed(r.id, g.id);
  else if (g.status === "failed") await markRefundFailed(r.id, "Gateway reported failure");
}
