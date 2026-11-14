import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertTransition, canTransition, FULFILLMENT_TRANSITIONS } from "@/domain/state-machines";
import type { FulfillmentStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { enqueueEmail } from "@/server/notifications/outbox";
import { getShippingProvider } from "@/server/shipping";
import type { TrackingEvent } from "@/server/shipping/provider";
import { getSettings } from "./settings";
import { lockOrder, orderLink, recordHistory, type Actor } from "./orders";
import { receiveReturnedUnits, shipOrderStock } from "./inventory";
import { audit } from "./audit";

type Addr = { line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string };

/** Manual packing steps (PACKED / READY_TO_SHIP / back to UNFULFILLED). */
export async function setPackingStatus(orderId: string, to: Extract<FulfillmentStatus, "PACKED" | "READY_TO_SHIP" | "UNFULFILLED">, actor: Actor) {
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!["CONFIRMED", "PROCESSING"].includes(order.status)) throw new AppError("NOT_FULFILLABLE", "Only confirmed orders can be packed.", 409);
    assertTransition("fulfillment", FULFILLMENT_TRANSITIONS, order.fulfillmentStatus, to);
    await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus: to, status: order.status === "CONFIRMED" ? "PROCESSING" : order.status } });
    await recordHistory(tx, orderId, "FULFILLMENT", order.fulfillmentStatus, to, actor);
    if (order.status === "CONFIRMED") await recordHistory(tx, orderId, "ORDER", "CONFIRMED", "PROCESSING", actor);
  });
}

export const shipmentInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("provider") }),
  z.object({
    mode: z.literal("manual"),
    courierName: z.string().trim().min(2).max(80),
    awb: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9-]+$/, "Tracking number may contain letters, digits and dashes"),
    trackingUrl: z.string().trim().url().refine((u) => u.startsWith("https://"), "Use an https:// tracking link").optional().or(z.literal("")),
  }),
]);

export async function createShipment(orderId: string, input: z.input<typeof shipmentInputSchema>, actor: Actor) {
  const data = shipmentInputSchema.parse(input);
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, shipments: true } });
  if (!order) throw notFound("Order");
  if (!["CONFIRMED", "PROCESSING"].includes(order.status)) throw new AppError("NOT_FULFILLABLE", "Only confirmed orders can be shipped.", 409);
  if (!["PAID", "COD_PENDING"].includes(order.paymentStatus)) throw new AppError("NOT_FULFILLABLE", "Order payment is not in a shippable state.", 409);
  if (!["UNFULFILLED", "PACKED", "READY_TO_SHIP"].includes(order.fulfillmentStatus)) throw new AppError("ALREADY_SHIPPED", "This order already has an active shipment.", 409);
  if (order.shipments.some((s) => !s.isReturn && !s.isExchange && !s.cancelledAt)) throw new AppError("ALREADY_SHIPPED", "This order already has an active shipment.", 409);

  let created: { providerOrderId?: string; providerShipmentId?: string; awb?: string; courierName?: string; trackingUrl?: string; labelUrl?: string };
  let providerName: string;
  if (data.mode === "provider") {
    const provider = getShippingProvider();
    if (!provider.createShipment) throw new AppError("NO_AUTOMATION", "No shipping integration is configured. Enter courier details manually.", 409);
    const addr = order.shippingAddress as Addr;
    const settings = await getSettings();
    created = await provider.createShipment({
      orderNumber: order.number,
      orderDate: order.placedAt,
      customerName: order.customerName,
      email: order.email,
      phone: order.phone,
      address: addr,
      items: order.items.map((i) => ({ name: `${i.productName} ${i.colorName}/${i.size}`, sku: i.sku, units: i.quantity, sellingPrice: i.unitPrice, hsn: i.hsnCode })),
      paymentMethod: order.paymentMethod,
      subtotal: order.grandTotal,
      weightGrams: settings.shipping.defaultWeightGrams * order.items.reduce((s, i) => s + i.quantity, 0),
    });
    providerName = provider.name;
  } else {
    created = { awb: data.awb, courierName: data.courierName, trackingUrl: data.trackingUrl || undefined };
    providerName = "manual";
  }

  return db.$transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    const shipment = await tx.shipment.create({ data: { orderId, provider: providerName, ...created, status: "READY_TO_SHIP" } });
    if (o.fulfillmentStatus !== "READY_TO_SHIP") {
      await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus: "READY_TO_SHIP", status: o.status === "CONFIRMED" ? "PROCESSING" : o.status } });
      await recordHistory(tx, orderId, "FULFILLMENT", o.fulfillmentStatus, "READY_TO_SHIP", actor, `${created.courierName ?? providerName} ${created.awb ?? ""}`.trim());
      if (o.status === "CONFIRMED") await recordHistory(tx, orderId, "ORDER", "CONFIRMED", "PROCESSING", actor);
    }
    await audit({ actorId: actor.id, action: "shipment.create", entityType: "Order", entityId: orderId, after: { shipmentId: shipment.id, awb: created.awb, provider: providerName } }, tx);
    return shipment;
  });
}

const EVENT_TO_STATUS: Partial<Record<TrackingEvent["status"], FulfillmentStatus>> = {
  SHIPPED: "SHIPPED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  RTO_INITIATED: "RTO_INITIATED",
  RTO_DELIVERED: "RTO_DELIVERED",
};

/**
 * Apply a tracking event (from a provider webhook, polling, or an admin).
 * Duplicate events are ignored via ShipmentEvent.dedupeKey.
 */
export async function applyShipmentEvent(shipmentId: string, ev: TrackingEvent, actor: Actor) {
  return db.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw notFound("Shipment");
    const inserted = await tx.shipmentEvent.createMany({
      data: [{ shipmentId, status: ev.status, description: ev.description.slice(0, 300), location: ev.location?.slice(0, 120), occurredAt: ev.occurredAt, dedupeKey: ev.dedupeKey }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return { duplicate: true };
    const target = EVENT_TO_STATUS[ev.status];
    if (!target) return { duplicate: false };
    const order = await lockOrder(tx, shipment.orderId);

    if (shipment.isExchange || shipment.isReturn) {
      if (canTransition(FULFILLMENT_TRANSITIONS, shipment.status, target)) await tx.shipment.update({ where: { id: shipmentId }, data: { status: target, ...(target === "DELIVERED" ? { deliveredAt: ev.occurredAt } : {}) } });
      return { duplicate: false };
    }
    // Allow skipping intermediate scans (e.g. READY_TO_SHIP → DELIVERED) by walking through SHIPPED.
    let from = order.fulfillmentStatus;
    if (from === target) return { duplicate: false };
    if ((target === "DELIVERED" || target === "OUT_FOR_DELIVERY" || target === "RTO_INITIATED") && ["READY_TO_SHIP", "PACKED", "UNFULFILLED"].includes(from)) {
      await applyStatus(tx, order, from, "SHIPPED", shipment.id, actor, ev);
      from = "SHIPPED";
    }
    if (!canTransition(FULFILLMENT_TRANSITIONS, from, target)) {
      logger.warn("shipment.ignored_transition", { orderId: order.id, from, to: target });
      return { duplicate: false };
    }
    await applyStatus(tx, order, from, target, shipment.id, actor, ev);
    return { duplicate: false };
  });
}

async function applyStatus(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  order: Awaited<ReturnType<typeof lockOrder>>,
  from: FulfillmentStatus,
  to: FulfillmentStatus,
  shipmentId: string,
  actor: Actor,
  ev: TrackingEvent,
) {
  const orderData: Prisma.OrderUpdateInput = { fulfillmentStatus: to };
  const shipData: Prisma.ShipmentUpdateInput = { status: to };
  const link = orderLink(order.number);
  const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  const vars = { name: order.customerName, orderNumber: order.number, courier: shipment.courierName ?? "our courier partner", awb: shipment.awb ?? "—", link };
  if (to === "SHIPPED") {
    shipData.shippedAt = ev.occurredAt;
    await shipOrderStock(tx, order.id);
    await enqueueEmail({ template: "order_shipped", to: order.email, vars, dedupeKey: `shipped:${order.id}` }, tx);
  } else if (to === "OUT_FOR_DELIVERY") {
    await enqueueEmail({ template: "out_for_delivery", to: order.email, vars, dedupeKey: `ofd:${order.id}:${ev.occurredAt.toISOString().slice(0, 10)}` }, tx);
  } else if (to === "DELIVERED") {
    shipData.deliveredAt = ev.occurredAt;
    orderData.deliveredAt = ev.occurredAt;
    if (["CONFIRMED", "PROCESSING"].includes(order.status)) {
      orderData.status = "COMPLETED";
      await recordHistory(tx, order.id, "ORDER", order.status, "COMPLETED", actor);
    }
    if (order.paymentStatus === "COD_PENDING") {
      orderData.paymentStatus = "COD_COLLECTED";
      await recordHistory(tx, order.id, "PAYMENT", "COD_PENDING", "COD_COLLECTED", actor, "Collected on delivery");
    }
    await enqueueEmail({ template: "order_delivered", to: order.email, vars, dedupeKey: `delivered:${order.id}` }, tx);
  } else if (to === "RTO_DELIVERED") {
    // Parcel back at the warehouse: quarantine units for inspection, never auto-restock.
    await receiveReturnedUnits(tx, `rto:${order.id}`, order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })), order.id);
    if (order.paymentStatus === "COD_PENDING") {
      orderData.paymentStatus = "FAILED";
      await recordHistory(tx, order.id, "PAYMENT", "COD_PENDING", "FAILED", actor, "COD not collected (RTO)");
    }
  }
  await tx.order.update({ where: { id: order.id }, data: orderData });
  await tx.shipment.update({ where: { id: shipmentId }, data: shipData });
  await recordHistory(tx, order.id, "FULFILLMENT", from, to, actor, ev.description);
}

/** Admin action: record a status for a shipment (manual fulfillment). */
export async function adminRecordShipmentStatus(shipmentId: string, status: TrackingEvent["status"], note: string | undefined, actor: Actor) {
  const now = new Date();
  return applyShipmentEvent(shipmentId, { status, description: note || status.replace(/_/g, " ").toLowerCase(), occurredAt: now, dedupeKey: `admin:${shipmentId}:${status}:${now.getTime()}` }, actor);
}

export async function cancelShipment(shipmentId: string, actor: Actor) {
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw notFound("Shipment");
  if (shipment.status !== "READY_TO_SHIP") throw new AppError("CANNOT_CANCEL", "Only shipments that haven't been picked up can be cancelled.", 409);
  const provider = getShippingProvider();
  if (shipment.provider === provider.name && provider.cancelShipment && shipment.awb) await provider.cancelShipment(shipment.awb, shipment.providerOrderId ?? undefined);
  await db.$transaction(async (tx) => {
    const order = await lockOrder(tx, shipment.orderId);
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    if (order.fulfillmentStatus === "READY_TO_SHIP") {
      await tx.order.update({ where: { id: order.id }, data: { fulfillmentStatus: "PACKED" } });
      await recordHistory(tx, order.id, "FULFILLMENT", "READY_TO_SHIP", "PACKED", actor, "Shipment cancelled");
    }
    await audit({ actorId: actor.id, action: "shipment.cancel", entityType: "Order", entityId: order.id, after: { shipmentId } }, tx);
  });
}

/** Poll provider tracking for in-flight shipments (job). */
export async function syncTracking(limit = 50) {
  const provider = getShippingProvider();
  if (!provider.track) return 0;
  const shipments = await db.shipment.findMany({ where: { provider: provider.name, awb: { not: null }, status: { in: ["READY_TO_SHIP", "SHIPPED", "OUT_FOR_DELIVERY", "RTO_INITIATED"] } }, take: limit });
  let n = 0;
  for (const s of shipments) {
    try {
      const events = (await provider.track(s.awb!)).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      for (const ev of events) if (!(await applyShipmentEvent(s.id, ev, { type: "SYSTEM" })).duplicate) n++;
    } catch (e) {
      logger.warn("tracking.sync_failed", { shipmentId: s.id, e });
    }
  }
  return n;
}

export async function handleShippingWebhook(providerName: string, body: unknown, headers: Headers) {
  const provider = getShippingProvider();
  if (provider.name !== providerName || !provider.parseWebhook) throw new AppError("UNKNOWN_PROVIDER", "Unknown provider", 404);
  const parsed = provider.parseWebhook(body, headers);
  if (!parsed) throw new AppError("UNAUTHORIZED", "Invalid webhook", 401);
  const shipment = await db.shipment.findFirst({ where: { provider: providerName, awb: parsed.awb } });
  if (!shipment) return { matched: false };
  for (const ev of parsed.events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) await applyShipmentEvent(shipment.id, ev, { type: "WEBHOOK" });
  return { matched: true };
}
