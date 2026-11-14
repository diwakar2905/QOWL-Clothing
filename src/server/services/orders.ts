import "server-only";
import { db, type Tx } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { logger } from "@/lib/logger";
import { hmacSha256Hex, sha256 } from "@/lib/crypto";
import { assertTransition, ORDER_TRANSITIONS, PAYMENT_TRANSITIONS, canTransition } from "@/domain/state-machines";
import type { ActorType, OrderStatus, PaymentStatus, StatusField } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/server/notifications/outbox";
import { commitOrderStock, releaseReservations, restoreCommittedStock } from "./inventory";
import { audit } from "./audit";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export type Actor = { type: ActorType; id?: string | null };
export const SYSTEM: Actor = { type: "SYSTEM" };

export async function recordHistory(tx: Tx, orderId: string, field: StatusField, from: string | null, to: string, actor: Actor, note?: string) {
  await tx.orderStatusHistory.create({ data: { orderId, field, fromValue: from, toValue: to, actorType: actor.type, actorId: actor.id ?? null, note: note?.slice(0, 500) } });
}

/** Lock the order row for the remainder of the transaction. */
export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
}

export async function nextNumber(tx: Tx, key: string, prefix: string, pad = 6): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${prefix}${String(rows[0]!.value).padStart(pad, "0")}`;
}

/**
 * Per-order access token for guest links. Derived (HMAC under SESSION_SECRET)
 * rather than random so every email can carry a working link and tokens never
 * need rotating; only its SHA-256 is stored on the order.
 */
export function orderAccessToken(orderId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return Buffer.from(hmacSha256Hex(secret, `order-access:${orderId}`), "hex").toString("base64url").slice(0, 32);
}

export function orderLink(order: { id: string; number: string }) {
  return `${appUrl()}/orders/${order.number}?t=${orderAccessToken(order.id)}`;
}

function itemsSummary(items: { productName: string; colorName: string; size: string; quantity: number }[]) {
  return items.map((i) => `• ${i.productName} — ${i.colorName} / ${i.size} × ${i.quantity}`).join("\n");
}

async function setStatuses(
  tx: Tx,
  order: { id: string; status: OrderStatus; paymentStatus: PaymentStatus },
  next: { status?: OrderStatus; paymentStatus?: PaymentStatus },
  actor: Actor,
  note?: string,
) {
  const data: { status?: OrderStatus; paymentStatus?: PaymentStatus } = {};
  if (next.status && next.status !== order.status) {
    assertTransition("order", ORDER_TRANSITIONS, order.status, next.status);
    data.status = next.status;
    await recordHistory(tx, order.id, "ORDER", order.status, next.status, actor, note);
  }
  if (next.paymentStatus && next.paymentStatus !== order.paymentStatus) {
    assertTransition("payment", PAYMENT_TRANSITIONS, order.paymentStatus, next.paymentStatus);
    data.paymentStatus = next.paymentStatus;
    await recordHistory(tx, order.id, "PAYMENT", order.paymentStatus, next.paymentStatus, actor, note);
  }
  if (Object.keys(data).length) await tx.order.update({ where: { id: order.id }, data });
}

/**
 * Idempotently mark an online order as paid. Safe to call from the checkout
 * callback, webhooks and reconciliation concurrently: the order row lock and
 * status checks guarantee a single confirmation.
 */
export async function finalizePaidOrder(args: { orderId: string; providerPaymentId: string; providerOrderId: string; amount: number; method?: string | null; actor: Actor }) {
  const result = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, args.orderId);
    const payment = await tx.payment.findFirst({ where: { orderId: order.id, providerOrderId: args.providerOrderId } });
    if (!payment) throw new AppError("PAYMENT_MISMATCH", "Payment does not belong to this order", 400);
    if (order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED" || order.paymentStatus === "REFUNDED") {
      return { alreadyFinal: true, onHold: false };
    }
    if (order.status === "CANCELLED" || order.status === "COMPLETED") {
      // Late capture on a closed order: record the money and flag for refund.
      await tx.payment.update({ where: { id: payment.id }, data: { providerPaymentId: args.providerPaymentId, status: "CAPTURED", capturedAt: new Date(), method: args.method ?? undefined } });
      await setStatuses(tx, order, { paymentStatus: "PAID" }, args.actor, "Payment captured after order was closed — refund required");
      await audit({ action: "payment.captured_on_closed_order", entityType: "Order", entityId: order.id, summary: "Refund required" }, tx);
      return { alreadyFinal: false, onHold: true };
    }
    if (args.amount !== order.grandTotal) {
      // Never ship against a payment that doesn't match the order: hold it and free the stock hold.
      logger.error("payment.amount_mismatch", { orderId: order.id, expected: order.grandTotal, got: args.amount });
      await tx.payment.update({ where: { id: payment.id }, data: { providerPaymentId: args.providerPaymentId, status: "CAPTURED", capturedAt: new Date(), amount: args.amount } });
      await releaseReservations(tx, order.id, "RELEASED");
      await setStatuses(tx, order, { status: "ON_HOLD", paymentStatus: "PAID" }, args.actor, `Captured amount ${args.amount} differs from order total ${order.grandTotal}`);
      await audit({ action: "payment.amount_mismatch", entityType: "Order", entityId: order.id, after: { expected: order.grandTotal, captured: args.amount } }, tx);
      return { alreadyFinal: false, onHold: true };
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: { providerPaymentId: args.providerPaymentId, status: "CAPTURED", capturedAt: new Date(), method: args.method ?? undefined, errorCode: null, errorDescription: null },
    });
    const stock = await commitOrderStock(tx, order.id, order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })));
    const confirmedAt = new Date();
    if (!stock.ok) {
      // Paid but cannot be fulfilled (reservation expired and stock sold out).
      await setStatuses(tx, order, { status: "ON_HOLD", paymentStatus: "PAID" }, args.actor, "Payment captured but stock unavailable — refund or restock required");
      await audit({ action: "order.oversold_after_payment", entityType: "Order", entityId: order.id, after: { shortages: stock.shortages } }, tx);
    } else {
      await setStatuses(tx, order, { status: "CONFIRMED", paymentStatus: "PAID" }, args.actor);
      await tx.order.update({ where: { id: order.id }, data: { confirmedAt } });
    }
    await tx.couponRedemption.updateMany({ where: { orderId: order.id, status: "RESERVED" }, data: { status: "COMMITTED" } });
    if (order.cartId) await tx.cartItem.deleteMany({ where: { cartId: order.cartId } });
    if (order.cartId) await tx.cart.updateMany({ where: { id: order.cartId }, data: { couponCode: null } });
    await enqueueEmail(
      {
        template: "order_confirmation",
        to: order.email,
        vars: { name: order.customerName, orderNumber: order.number, itemsSummary: itemsSummary(order.items), total: formatINR(order.grandTotal), link: orderLink(order) },
        dedupeKey: `order_confirmed:${order.id}`,
      },
      tx,
    );
    return { alreadyFinal: false, onHold: !stock.ok };
  });
  return result;
}

/** Mark an online payment attempt as failed; stock stays reserved until expiry so the customer can retry. */
export async function markPaymentFailed(args: { orderId: string; providerOrderId: string; providerPaymentId?: string; errorCode?: string | null; errorDescription?: string | null; actor: Actor }) {
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, args.orderId);
    if (order.paymentStatus !== "PENDING" && order.paymentStatus !== "AUTHORIZED" && order.paymentStatus !== "FAILED") return;
    await tx.payment.updateMany({
      where: { orderId: order.id, providerOrderId: args.providerOrderId, status: { in: ["CREATED", "AUTHORIZED", "FAILED"] } },
      data: { status: "FAILED", providerPaymentId: args.providerPaymentId, errorCode: args.errorCode?.slice(0, 100), errorDescription: args.errorDescription?.slice(0, 300) },
    });
    if (order.status === "PENDING_PAYMENT") {
      await setStatuses(tx, order, { status: "PAYMENT_FAILED", paymentStatus: "FAILED" }, args.actor, args.errorDescription ?? undefined);
      await enqueueEmail(
        { template: "payment_failed", to: order.email, vars: { name: order.customerName, orderNumber: order.number, link: `${appUrl()}/cart` }, dedupeKey: `payment_failed:${order.id}` },
        tx,
      );
    }
  });
}

/** Release stock and coupons for orders whose payment window lapsed. Idempotent. */
export async function expireOrder(orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") {
      // Safety net: an expired hold on a non-pending order must not pin stock forever.
      await releaseReservations(tx, order.id, "EXPIRED");
      return false;
    }
    await releaseReservations(tx, order.id, "EXPIRED");
    await tx.couponRedemption.updateMany({ where: { orderId: order.id, status: "RESERVED" }, data: { status: "RELEASED" } });
    await setStatuses(tx, order, { status: "EXPIRED" }, SYSTEM, "Payment window expired");
    return true;
  });
}

export async function expireStaleOrders(limit = 100): Promise<number> {
  const stale = await db.inventoryReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
    select: { orderId: true },
    distinct: ["orderId"],
    take: limit,
  });
  let n = 0;
  for (const s of stale) if (await expireOrder(s.orderId).catch((e) => (logger.error("order.expire_failed", { orderId: s.orderId, e }), false))) n++;
  return n;
}

/**
 * Cancel an order. Unpaid: releases reservations. Paid & unshipped: restores
 * committed stock; any refund is issued separately via the refunds service
 * (so it is authorised and audited on its own).
 */
export async function cancelOrder(orderId: string, actor: Actor, reason: string) {
  const res = await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status === "CANCELLED") return { order, needsRefund: false };
    if (!["UNFULFILLED", "PACKED", "READY_TO_SHIP"].includes(order.fulfillmentStatus)) {
      throw new AppError("CANNOT_CANCEL", "Orders that have shipped can't be cancelled; use a return instead.", 409);
    }
    if (!canTransition(ORDER_TRANSITIONS, order.status, "CANCELLED")) throw new AppError("CANNOT_CANCEL", `Order in status ${order.status} cannot be cancelled.`, 409);
    await releaseReservations(tx, order.id, "RELEASED");
    // Restores exactly what the ledger says this order still has committed.
    await restoreCommittedStock(tx, order.id);
    await tx.couponRedemption.updateMany({ where: { orderId: order.id, status: { in: ["RESERVED", "COMMITTED"] } }, data: { status: "RELEASED" } });
    await setStatuses(tx, order, { status: "CANCELLED" }, actor, reason);
    if (order.fulfillmentStatus !== "CANCELLED") {
      await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: "CANCELLED" } });
      await recordHistory(tx, order.id, "FULFILLMENT", order.fulfillmentStatus, "CANCELLED", actor, reason);
    }
    if (order.paymentStatus === "COD_PENDING") {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
      await recordHistory(tx, order.id, "PAYMENT", "COD_PENDING", "FAILED", actor, "COD order cancelled before delivery");
    }
    await tx.order.update({ where: { id: order.id }, data: { cancelledAt: new Date(), cancelReason: reason.slice(0, 300) } });
    if (order.confirmedAt) {
      await enqueueEmail(
        { template: "order_cancelled", to: order.email, vars: { name: order.customerName, orderNumber: order.number, reason, link: orderLink(order) }, dedupeKey: `order_cancelled:${order.id}` },
        tx,
      );
    }
    if (actor.type === "ADMIN") await audit({ actorId: actor.id, action: "order.cancel", entityType: "Order", entityId: order.id, summary: reason }, tx);
    return { order, needsRefund: order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED" };
  });
  return res;
}

export async function requestCancellation(orderId: string, actor: Actor, reason: string) {
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.fulfillmentStatus !== "UNFULFILLED") throw new AppError("CANNOT_CANCEL", "This order is already being packed or has shipped.", 409);
    if (!canTransition(ORDER_TRANSITIONS, order.status, "CANCELLATION_REQUESTED")) throw new AppError("CANNOT_CANCEL", "This order can't be cancelled online. Please contact support.", 409);
    await setStatuses(tx, order, { status: "CANCELLATION_REQUESTED" }, actor, reason);
  });
}

/** Admin-driven order status change, validated against the state machine. */
export async function adminSetOrderStatus(orderId: string, to: OrderStatus, actor: Actor, note?: string) {
  if (to === "CANCELLED") return cancelOrder(orderId, actor, note || "Cancelled by store");
  if (to === "CONFIRMED" || to === "EXPIRED" || to === "PAYMENT_FAILED") throw new AppError("NOT_ALLOWED", "This status is set by the payment system, not manually.", 400);
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    await setStatuses(tx, order, { status: to }, actor, note);
    await audit({ actorId: actor.id, action: "order.status", entityType: "Order", entityId: orderId, before: { status: order.status }, after: { status: to }, summary: note }, tx);
  });
}

/** Re-attempt to commit stock for an order held after payment (e.g. after restocking). */
export async function releaseHold(orderId: string, actor: Actor) {
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "ON_HOLD") throw new AppError("NOT_ON_HOLD", "Order is not on hold", 409);
    // commitOrderStock skips units already committed by the earlier attempt.
    const r = await commitOrderStock(tx, orderId, order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })));
    if (!r.ok) throw new AppError("OUT_OF_STOCK", "Still insufficient stock to fulfil this order. Restock or refund.", 409, r.shortages);
    await setStatuses(tx, order, { status: "CONFIRMED" }, actor, "Hold released");
    if (!order.confirmedAt) await tx.order.update({ where: { id: orderId }, data: { confirmedAt: new Date() } });
  });
}

export async function addOrderNote(orderId: string, authorId: string, body: string) {
  const text = body.trim().slice(0, 2000);
  if (!text) throw new AppError("EMPTY", "Note cannot be empty");
  await db.orderNote.create({ data: { orderId, authorId, body: text } });
}

/** Guest order access via the unguessable token in the confirmation link. */
export async function getOrderForAccess(number: string, opts: { userId?: string | null; token?: string | null }) {
  const order = await db.order.findUnique({
    where: { number },
    include: {
      items: true,
      shipments: { include: { events: { orderBy: { occurredAt: "desc" } } }, orderBy: { createdAt: "desc" } },
      history: { orderBy: { createdAt: "asc" } },
      returnRequests: { include: { items: true }, orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) return null;
  const owner = opts.userId && order.userId === opts.userId;
  const tokenOk = opts.token && opts.token.length <= 100 && order.accessTokenHash === sha256(opts.token);
  if (!owner && !tokenOk) return null;
  return order;
}

export async function getOrderByNumberForUser(number: string, userId: string) {
  const o = await getOrderForAccess(number, { userId });
  if (!o) throw notFound("Order");
  return o;
}
