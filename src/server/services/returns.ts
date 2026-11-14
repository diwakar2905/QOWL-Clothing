import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { assertTransition, humanise, RETURN_TRANSITIONS } from "@/domain/state-machines";
import { canRequestReturn, refundForReturnedUnits } from "@/domain/returns";
import type { ReturnStatus } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/server/notifications/outbox";
import { getSetting } from "./settings";
import { nextNumber, orderLink, recordHistory, lockOrder, type Actor } from "./orders";
import { commitOrderStock, receiveReturnedUnits, resolveInspectedUnits } from "./inventory";
import { createRefund } from "./refunds";
import { audit } from "./audit";

export const returnRequestSchema = z.object({
  type: z.enum(["RETURN", "EXCHANGE"]),
  reason: z.string().trim().min(3).max(120),
  customerNote: z.string().trim().max(1000).optional(),
  photoUrls: z.array(z.string().max(500)).max(5).default([]),
  items: z
    .array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1).max(10), exchangeVariantId: z.string().optional() }))
    .min(1, "Select at least one item"),
});

/** Units of an order line still available for a new return/exchange request. */
async function returnableUnits(orderItemId: string, quantity: number) {
  const open = await db.returnItem.aggregate({
    where: { orderItemId, returnRequest: { status: { notIn: ["REJECTED", "CANCELLED"] } } },
    _sum: { quantity: true },
  });
  return quantity - (open._sum.quantity ?? 0);
}

export async function requestReturn(orderId: string, input: z.input<typeof returnRequestSchema>, actor: Actor & { userId?: string | null }) {
  const data = returnRequestSchema.parse(input);
  const policy = await getSetting("returns");
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw notFound("Order");
  const ok = canRequestReturn(policy, order, data.type);
  if (!ok.ok) throw new AppError("NOT_ELIGIBLE", ok.reason, 409);
  if (policy.requirePhotos && data.photoUrls.length === 0) throw new AppError("PHOTOS_REQUIRED", "Please add at least one photo of the item.");
  if (!policy.reasons.includes(data.reason)) throw new AppError("INVALID_REASON", "Select a reason from the list.");
  for (const it of data.items) {
    const line = order.items.find((i) => i.id === it.orderItemId);
    if (!line) throw new AppError("INVALID_ITEM", "Item does not belong to this order.");
    if (it.quantity > (await returnableUnits(line.id, line.quantity))) throw new AppError("INVALID_QTY", `You can't request more units of ${line.productName} than remain eligible.`);
    if (data.type === "EXCHANGE") {
      if (!it.exchangeVariantId) throw new AppError("EXCHANGE_VARIANT", "Choose the size/colour you'd like instead.");
      const v = await db.productVariant.findUnique({ where: { id: it.exchangeVariantId } });
      if (!v || v.productId !== line.productId || !v.isActive) throw new AppError("EXCHANGE_VARIANT", "Exchanges must be for another size or colour of the same product.");
    }
  }
  const rr = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx, "return", "RQ-", 5);
    const created = await tx.returnRequest.create({
      data: {
        number,
        orderId,
        userId: actor.userId ?? null,
        type: data.type,
        reason: data.reason,
        customerNote: data.customerNote,
        photoUrls: data.photoUrls,
        items: { create: data.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity, exchangeVariantId: data.type === "EXCHANGE" ? i.exchangeVariantId : null })) },
      },
    });
    await recordHistory(tx, orderId, "RETURN", null, `${data.type} ${number} REQUESTED`, actor);
    await enqueueEmail({ template: "return_requested", to: order.email, vars: { name: order.customerName, type: data.type.toLowerCase(), returnNumber: number, orderNumber: order.number, link: orderLink(order.number) }, dedupeKey: `return_requested:${created.id}` }, tx);
    return created;
  });
  return rr;
}

const CUSTOMER_NOTIFY: ReturnStatus[] = ["APPROVED", "REJECTED", "PICKUP_SCHEDULED", "RECEIVED", "EXCHANGE_SHIPPED", "COMPLETED"];

/** Admin workflow transitions (approve/reject/pickup/received). */
export async function transitionReturn(returnId: string, to: ReturnStatus, actor: Actor, opts: { note?: string; rejectionReason?: string; pickupAt?: Date } = {}) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id = ${returnId} FOR UPDATE`;
    const rr = await tx.returnRequest.findUnique({ where: { id: returnId }, include: { items: { include: { orderItem: true } }, order: true } });
    if (!rr) throw notFound("Return request");
    assertTransition("return", RETURN_TRANSITIONS, rr.status, to);
    if (to === "REJECTED" && !opts.rejectionReason) throw new AppError("REASON_REQUIRED", "Provide a reason for rejecting this request.");
    if (["INSPECTED", "REFUND_PENDING", "EXCHANGE_SHIPPED"].includes(to)) throw new AppError("USE_DEDICATED_ACTION", "Use the inspection/refund/exchange actions for this step.");
    const data: Record<string, unknown> = { status: to, adminNote: opts.note ?? rr.adminNote };
    if (to === "REJECTED") data.rejectionReason = opts.rejectionReason;
    if (to === "PICKUP_SCHEDULED") data.pickupScheduledAt = opts.pickupAt ?? new Date();
    if (to === "RECEIVED") {
      data.receivedAt = new Date();
      await receiveReturnedUnits(tx, rr.id, rr.items.filter((i) => i.orderItem.variantId).map((i) => ({ variantId: i.orderItem.variantId!, quantity: i.quantity })), rr.orderId);
    }
    await tx.returnRequest.update({ where: { id: returnId }, data });
    await recordHistory(tx, rr.orderId, "RETURN", rr.status, `${rr.number} ${to}`, actor, opts.rejectionReason ?? opts.note);
    await audit({ actorId: actor.id, action: "return.transition", entityType: "ReturnRequest", entityId: rr.id, before: { status: rr.status }, after: { status: to } }, tx);
    if (CUSTOMER_NOTIFY.includes(to)) {
      await enqueueEmail(
        { template: "return_update", to: rr.order.email, vars: { name: rr.order.customerName, type: rr.type.toLowerCase(), returnNumber: rr.number, status: humanise(to), note: opts.rejectionReason ?? opts.note ?? "", link: orderLink(rr.order.number) }, dedupeKey: `return:${rr.id}:${to}` },
        tx,
      );
    }
  });
}

export const inspectionSchema = z.object({
  items: z.array(z.object({ returnItemId: z.string(), restock: z.number().int().min(0), damaged: z.number().int().min(0), note: z.string().max(300).optional() })),
});

/** Record inspection; restocking is an explicit per-item decision. */
export async function inspectReturn(returnId: string, input: z.input<typeof inspectionSchema>, actor: Actor) {
  const data = inspectionSchema.parse(input);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id = ${returnId} FOR UPDATE`;
    const rr = await tx.returnRequest.findUnique({ where: { id: returnId }, include: { items: { include: { orderItem: true } } } });
    if (!rr) throw notFound("Return request");
    assertTransition("return", RETURN_TRANSITIONS, rr.status, "INSPECTED");
    for (const item of rr.items) {
      const r = data.items.find((x) => x.returnItemId === item.id);
      if (!r) throw new AppError("INCOMPLETE", "Record an outcome for every returned item.");
      if (r.restock + r.damaged !== item.quantity) throw new AppError("QTY_MISMATCH", `Restocked + damaged must equal ${item.quantity} for ${item.orderItem.productName}.`);
      if (item.orderItem.variantId) await resolveInspectedUnits(tx, { variantId: item.orderItem.variantId, restock: r.restock, damaged: r.damaged, returnId, actorId: actor.id!, note: r.note });
      await tx.returnItem.update({ where: { id: item.id }, data: { restockedQty: r.restock, damagedQty: r.damaged, inspectionNote: r.note } });
      await tx.orderItem.update({ where: { id: item.orderItemId }, data: { returnedQty: { increment: item.quantity } } });
    }
    await tx.returnRequest.update({ where: { id: returnId }, data: { status: "INSPECTED", inspectedAt: new Date() } });
    await recordHistory(tx, rr.orderId, "RETURN", rr.status, `${rr.number} INSPECTED`, actor);
    await audit({ actorId: actor.id, action: "return.inspect", entityType: "ReturnRequest", entityId: rr.id, after: data }, tx);
  });
}

/** Suggested refund for a return: the customer's paid share of the returned units. */
export async function suggestedRefund(returnId: string): Promise<number> {
  const rr = await db.returnRequest.findUniqueOrThrow({ where: { id: returnId }, include: { items: { include: { orderItem: true } } } });
  return rr.items.reduce((s, i) => s + refundForReturnedUnits(i.orderItem, i.quantity), 0);
}

export async function refundReturn(returnId: string, args: { amount: number; method: "GATEWAY" | "MANUAL"; manualReference?: string; idempotencyKey: string }, actor: Actor) {
  const rr = await db.returnRequest.findUnique({ where: { id: returnId } });
  if (!rr) throw notFound("Return request");
  if (rr.type !== "RETURN") throw new AppError("NOT_RETURN", "Exchanges are fulfilled by shipping a replacement.");
  if (rr.status !== "INSPECTED" && rr.status !== "REFUND_PENDING") throw new AppError("NOT_READY", "Inspect the returned items before refunding.", 409);
  if (rr.status === "INSPECTED") {
    await db.$transaction(async (tx) => {
      await tx.returnRequest.update({ where: { id: returnId }, data: { status: "REFUND_PENDING" } });
      await recordHistory(tx, rr.orderId, "RETURN", "INSPECTED", `${rr.number} REFUND_PENDING`, actor);
    });
  }
  return createRefund({ orderId: rr.orderId, amount: args.amount, reason: `Return ${rr.number}`, method: args.method, manualReference: args.manualReference, returnRequestId: rr.id, idempotencyKey: args.idempotencyKey }, actor.id!);
}

/**
 * Ship exchange replacements: commits stock for the requested variants and
 * records a replacement shipment linked to the original order.
 */
export async function shipExchange(returnId: string, details: { courierName: string; awb: string; trackingUrl?: string }, actor: Actor) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ReturnRequest" WHERE id = ${returnId} FOR UPDATE`;
    const rr = await tx.returnRequest.findUnique({ where: { id: returnId }, include: { items: true, order: true } });
    if (!rr) throw notFound("Return request");
    if (rr.type !== "EXCHANGE") throw new AppError("NOT_EXCHANGE", "Not an exchange request");
    assertTransition("return", RETURN_TRANSITIONS, rr.status, "EXCHANGE_SHIPPED");
    await lockOrder(tx, rr.orderId);
    const lines = rr.items.map((i) => ({ variantId: i.exchangeVariantId!, quantity: i.quantity }));
    // Ledger entries keyed to a synthetic id keep exchange stock separate from the original sale.
    const r = await commitOrderStock(tx, `exchange:${rr.id}`, lines);
    if (!r.ok) throw new AppError("OUT_OF_STOCK", "The requested exchange size/colour is out of stock.", 409, r.shortages);
    await tx.$executeRaw`UPDATE "InventoryMovement" SET "orderId" = ${rr.orderId}, "returnId" = ${rr.id} WHERE "orderId" = ${`exchange:${rr.id}`}`;
    for (const l of lines) {
      await tx.$executeRaw`UPDATE "InventoryLevel" SET "committed" = GREATEST("committed" - ${l.quantity}, 0) WHERE "variantId" = ${l.variantId}`;
      await tx.inventoryMovement.create({ data: { variantId: l.variantId, type: "SHIPMENT", committedDelta: -l.quantity, onHandAfter: 0, orderId: rr.orderId, returnId: rr.id, actorId: actor.id, note: "Exchange replacement shipped" } });
    }
    await tx.shipment.create({ data: { orderId: rr.orderId, provider: "manual", isExchange: true, courierName: details.courierName, awb: details.awb, trackingUrl: details.trackingUrl, status: "SHIPPED", shippedAt: new Date(), note: `Exchange ${rr.number}` } });
    await tx.returnRequest.update({ where: { id: returnId }, data: { status: "EXCHANGE_SHIPPED" } });
    await recordHistory(tx, rr.orderId, "RETURN", rr.status, `${rr.number} EXCHANGE_SHIPPED`, actor);
    await enqueueEmail(
      { template: "return_update", to: rr.order.email, vars: { name: rr.order.customerName, type: "exchange", returnNumber: rr.number, status: "Replacement shipped", note: `${details.courierName} — ${details.awb}`, link: orderLink(rr.order.number) }, dedupeKey: `return:${rr.id}:EXCHANGE_SHIPPED` },
      tx,
    );
  });
}

export async function completeReturn(returnId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const rr = await tx.returnRequest.findUniqueOrThrow({ where: { id: returnId }, include: { order: true } });
    assertTransition("return", RETURN_TRANSITIONS, rr.status, "COMPLETED");
    if (rr.status === "REFUND_PENDING") {
      const pending = await tx.refund.count({ where: { returnRequestId: rr.id, status: { not: "PROCESSED" } } });
      if (pending) throw new AppError("REFUND_PENDING", "The refund hasn't been confirmed by the payment provider yet.", 409);
    }
    await tx.returnRequest.update({ where: { id: returnId }, data: { status: "COMPLETED" } });
    await recordHistory(tx, rr.orderId, "RETURN", rr.status, `${rr.number} COMPLETED`, actor);
  });
}

export async function cancelReturnByCustomer(returnId: string, userId: string) {
  const rr = await db.returnRequest.findFirst({ where: { id: returnId, userId } });
  if (!rr) throw notFound("Return request");
  if (rr.status !== "REQUESTED") throw new AppError("CANNOT_CANCEL", "This request is already being processed.", 409);
  await db.returnRequest.update({ where: { id: returnId }, data: { status: "CANCELLED" } });
}
