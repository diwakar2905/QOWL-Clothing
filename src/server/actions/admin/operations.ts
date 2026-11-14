"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { randomToken } from "@/lib/crypto";
import { runAction } from "@/server/api";
import { requirePermission } from "@/server/auth/session";
import { clientIp } from "@/server/request";
import { audit } from "@/server/services/audit";
import { adjustStock } from "@/server/services/inventory";
import { adminSetOrderStatus, addOrderNote, cancelOrder, releaseHold } from "@/server/services/orders";
import { setPackingStatus, createShipment, adminRecordShipmentStatus, cancelShipment } from "@/server/services/fulfillment";
import { createRefund } from "@/server/services/refunds";
import { reconcileOrderPayments } from "@/server/services/payments";
import { transitionReturn, inspectReturn, refundReturn, shipExchange, completeReturn } from "@/server/services/returns";
import { anonymiseUser } from "@/server/services/auth";
import { moderateReview } from "@/server/services/reviews";
import type { OrderStatus, ReturnStatus } from "@/generated/prisma/enums";
import { str, opt, bool, paise, istDate, intOrNull } from "./_util";

const admin = (id: string) => ({ type: "ADMIN" as const, id });

// ─────────────────────────────── Inventory ───────────────────────────────

export async function adjustStockAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("inventory.write");
    const type = z.enum(["RESTOCK", "ADJUSTMENT", "CORRECTION", "DAMAGED"]).parse(str(form, "type"));
    const quantity = z.coerce.number().int().parse(str(form, "quantity"));
    const reason = z.string().min(3, "Give a reason for the audit trail").max(200).parse(str(form, "reason"));
    const r = await adjustStock({ variantId: str(form, "variantId"), type, quantity, reason, note: opt(form, "note") ?? undefined, actorId: u.id, lowStockThreshold: intOrNull(form, "lowStockThreshold") ?? undefined });
    await audit({ actorId: u.id, action: `inventory.${type.toLowerCase()}`, entityType: "ProductVariant", entityId: str(form, "variantId"), after: { quantity, reason, onHand: r.onHand }, ipAddress: await clientIp() });
    revalidatePath("/admin/inventory");
  }, "Stock updated.");
}

/**
 * CSV import: sku,mode,quantity,reason  (mode = add | set). Validates every
 * row first; applies all-or-nothing in one transaction.
 */
export async function importStockCsvAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("inventory.write");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("NO_FILE", "Choose a CSV file.");
    if (file.size > 1024 * 1024) throw new AppError("TOO_LARGE", "CSV must be under 1 MB.");
    const lines = (await file.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const header = lines.shift()?.toLowerCase().replace(/\s/g, "");
    if (header !== "sku,mode,quantity,reason") throw new AppError("BAD_HEADER", "First row must be: sku,mode,quantity,reason");
    const rows = lines.map((l, i) => {
      const [sku, mode, qty, ...rest] = l.split(",");
      const quantity = Number(qty);
      if (!sku || !["add", "set"].includes((mode ?? "").toLowerCase()) || !Number.isInteger(quantity) || (mode === "set" && quantity < 0) || (mode === "add" && quantity <= 0)) {
        throw new AppError("BAD_ROW", `Row ${i + 2} is invalid: "${l.slice(0, 80)}"`);
      }
      return { sku: sku.trim().toUpperCase(), mode: mode!.toLowerCase(), quantity, reason: rest.join(",").trim() || "CSV import" };
    });
    if (rows.length > 2000) throw new AppError("TOO_MANY", "Import at most 2,000 rows at once.");
    const variants = await db.productVariant.findMany({ where: { sku: { in: rows.map((r) => r.sku) } }, select: { id: true, sku: true } });
    const bySku = new Map(variants.map((v) => [v.sku, v.id]));
    const missing = rows.filter((r) => !bySku.has(r.sku)).map((r) => r.sku);
    if (missing.length) throw new AppError("UNKNOWN_SKU", `Unknown SKUs: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
    await db.$transaction(async (tx) => {
      for (const r of rows) await adjustStock({ variantId: bySku.get(r.sku)!, type: r.mode === "set" ? "CORRECTION" : "IMPORT", quantity: r.quantity, reason: r.reason, actorId: u.id }, tx);
    }, { timeout: 60000 });
    await audit({ actorId: u.id, action: "inventory.import", entityType: "Inventory", summary: `${rows.length} rows` });
    revalidatePath("/admin/inventory");
    return { rows: rows.length };
  }, "Import applied.");
}

// ──────────────────────────────── Orders ─────────────────────────────────

export async function orderStatusAction(orderId: string, status: OrderStatus, note?: string) {
  return runAction(async () => {
    const u = await requirePermission(status === "CANCELLED" ? "orders.cancel" : "orders.update");
    await adminSetOrderStatus(orderId, status, admin(u.id), note);
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Order updated.");
}

export async function cancelOrderAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("orders.cancel");
    const orderId = str(form, "orderId");
    const reason = z.string().min(3, "Enter a reason").max(300).parse(str(form, "reason"));
    const r = await cancelOrder(orderId, admin(u.id), reason);
    // Full refund for a paid order, if the admin chose to refund now.
    if (r.needsRefund && bool(form, "refund")) {
      await requirePermission("orders.refund");
      const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      await createRefund({ orderId, amount: o.grandTotal - o.refundedTotal, reason: `Cancelled: ${reason}`, method: o.paymentMethod === "COD" ? "MANUAL" : "GATEWAY", manualReference: opt(form, "manualReference") ?? undefined, idempotencyKey: `cancel:${orderId}` }, u.id);
    }
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Order cancelled.");
}

export async function releaseHoldAction(orderId: string) {
  return runAction(async () => {
    const u = await requirePermission("orders.update");
    await releaseHold(orderId, admin(u.id));
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Hold released.");
}

export async function addOrderNoteAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("orders.read");
    await addOrderNote(str(form, "orderId"), u.id, str(form, "body"));
    revalidatePath(`/admin/orders/${str(form, "orderId")}`);
  }, "Note added.");
}

export async function packingAction(orderId: string, to: "PACKED" | "READY_TO_SHIP" | "UNFULFILLED") {
  return runAction(async () => {
    const u = await requirePermission("orders.fulfill");
    await setPackingStatus(orderId, to, admin(u.id));
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Fulfillment updated.");
}

export async function createShipmentAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("orders.fulfill");
    const orderId = str(form, "orderId");
    const mode = str(form, "mode");
    await createShipment(orderId, mode === "provider" ? { mode: "provider" } : { mode: "manual", courierName: str(form, "courierName"), awb: str(form, "awb"), trackingUrl: str(form, "trackingUrl") }, admin(u.id));
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Shipment created.");
}

export async function shipmentStatusAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("orders.fulfill");
    const status = z.enum(["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "RTO_INITIATED", "RTO_DELIVERED", "IN_TRANSIT"]).parse(str(form, "status"));
    await adminRecordShipmentStatus(str(form, "shipmentId"), status, opt(form, "note") ?? undefined, admin(u.id));
    revalidatePath(`/admin/orders/${str(form, "orderId")}`);
  }, "Shipment updated.");
}

export async function cancelShipmentAction(shipmentId: string, orderId: string) {
  return runAction(async () => {
    const u = await requirePermission("orders.fulfill");
    await cancelShipment(shipmentId, admin(u.id));
    revalidatePath(`/admin/orders/${orderId}`);
  }, "Shipment cancelled.");
}

export async function refundAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("orders.refund");
    const orderId = str(form, "orderId");
    const refund = await createRefund(
      { orderId, amount: paise(form, "amount")!, reason: str(form, "reason"), method: z.enum(["GATEWAY", "MANUAL"]).parse(str(form, "method")), manualReference: opt(form, "manualReference") ?? undefined, idempotencyKey: str(form, "idempotencyKey") || randomToken(12) },
      u.id,
    );
    revalidatePath(`/admin/orders/${orderId}`);
    return { status: refund.status };
  }, "Refund submitted.");
}

export async function reconcileOrderAction(orderId: string) {
  return runAction(async () => {
    await requirePermission("orders.update");
    const r = await reconcileOrderPayments(orderId);
    revalidatePath(`/admin/orders/${orderId}`);
    return { status: r?.status ?? "no gateway payments" };
  }, "Checked with the payment gateway.");
}

// ──────────────────────────────── Returns ────────────────────────────────

export async function returnTransitionAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("returns.manage");
    const to = str(form, "to") as ReturnStatus;
    if (to === "RECEIVED") await requirePermission("returns.inspect");
    await transitionReturn(str(form, "returnId"), to, admin(u.id), { note: opt(form, "note") ?? undefined, rejectionReason: opt(form, "rejectionReason") ?? undefined, pickupAt: istDate(form, "pickupAt") ?? undefined });
    revalidatePath(`/admin/returns/${str(form, "returnId")}`);
  }, "Return updated.");
}

export async function inspectReturnAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("returns.inspect");
    const ids = form.getAll("returnItemId").map(String);
    await inspectReturn(str(form, "returnId"), { items: ids.map((id) => ({ returnItemId: id, restock: Number(form.get(`restock_${id}`) ?? 0), damaged: Number(form.get(`damaged_${id}`) ?? 0), note: String(form.get(`note_${id}`) ?? "") || undefined })) }, admin(u.id));
    revalidatePath(`/admin/returns/${str(form, "returnId")}`);
  }, "Inspection recorded.");
}

export async function refundReturnAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("orders.refund");
    await refundReturn(str(form, "returnId"), { amount: paise(form, "amount")!, method: z.enum(["GATEWAY", "MANUAL"]).parse(str(form, "method")), manualReference: opt(form, "manualReference") ?? undefined, idempotencyKey: `return:${str(form, "returnId")}:${str(form, "idempotencyKey")}` }, admin(u.id));
    revalidatePath(`/admin/returns/${str(form, "returnId")}`);
  }, "Refund submitted.");
}

export async function shipExchangeAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("orders.fulfill");
    await shipExchange(str(form, "returnId"), { courierName: z.string().min(2).parse(str(form, "courierName")), awb: z.string().min(3).parse(str(form, "awb")), trackingUrl: opt(form, "trackingUrl") ?? undefined }, admin(u.id));
    revalidatePath(`/admin/returns/${str(form, "returnId")}`);
  }, "Exchange shipped.");
}

export async function completeReturnAction(returnId: string) {
  return runAction(async () => {
    const u = await requirePermission("returns.manage");
    await completeReturn(returnId, admin(u.id));
    revalidatePath(`/admin/returns/${returnId}`);
  }, "Return completed.");
}

// ─────────────────────────────── Customers ───────────────────────────────

export async function updateCustomerAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("customers.update");
    const id = str(form, "id");
    const target = await db.user.findUnique({ where: { id } });
    if (!target || target.roleId) throw notFound("Customer");
    const status = z.enum(["ACTIVE", "SUSPENDED", "DELETION_REQUESTED"]).parse(str(form, "status"));
    await db.user.update({ where: { id }, data: { status, supportNotes: opt(form, "supportNotes") } });
    if (status === "SUSPENDED") await db.session.deleteMany({ where: { userId: id } });
    await audit({ actorId: u.id, action: "customer.update", entityType: "User", entityId: id, before: { status: target.status }, after: { status } });
    revalidatePath(`/admin/customers/${id}`);
  }, "Customer updated.");
}

export async function anonymiseCustomerAction(id: string) {
  return runAction(async () => {
    const u = await requirePermission("customers.update");
    const target = await db.user.findUnique({ where: { id } });
    if (!target || target.roleId) throw notFound("Customer");
    if (target.status !== "DELETION_REQUESTED") throw new AppError("NOT_REQUESTED", "Only accounts with a deletion request can be anonymised.", 409);
    await anonymiseUser(id, u.id);
    revalidatePath(`/admin/customers/${id}`);
  }, "Account anonymised.");
}

// ─────────────────────────────── Discounts ───────────────────────────────

export async function saveCouponAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("discounts.manage");
    const id = opt(form, "id");
    const type = z.enum(["PERCENT", "FIXED"]).parse(str(form, "type"));
    const value = type === "PERCENT" ? z.coerce.number().int().min(1).max(90).parse(str(form, "value")) : paise(form, "value")!;
    const scope = z.enum(["ALL", "PRODUCTS", "COLLECTIONS"]).parse(str(form, "scope") || "ALL");
    const data = {
      code: z.string().regex(/^[A-Z0-9_-]{3,40}$/, "Use 3–40 letters, digits, dashes").parse(str(form, "code").toUpperCase()),
      description: opt(form, "description"),
      type,
      value,
      minCartValue: paise(form, "minCartValue", false),
      maxDiscount: paise(form, "maxDiscount", false),
      startsAt: istDate(form, "startsAt"),
      endsAt: istDate(form, "endsAt"),
      usageLimit: intOrNull(form, "usageLimit"),
      perCustomerLimit: intOrNull(form, "perCustomerLimit"),
      firstOrderOnly: bool(form, "firstOrderOnly"),
      scope,
      isActive: bool(form, "isActive"),
    };
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) throw new AppError("VALIDATION", "End date must be after the start date.");
    const productIds = scope === "PRODUCTS" ? form.getAll("productIds").map(String) : [];
    const collectionIds = scope === "COLLECTIONS" ? form.getAll("collectionIds").map(String) : [];
    if (scope === "PRODUCTS" && !productIds.length) throw new AppError("VALIDATION", "Select at least one product.");
    if (scope === "COLLECTIONS" && !collectionIds.length) throw new AppError("VALIDATION", "Select at least one collection.");
    await db.$transaction(async (tx) => {
      const c = id ? await tx.coupon.update({ where: { id }, data }) : await tx.coupon.create({ data });
      await tx.couponProduct.deleteMany({ where: { couponId: c.id } });
      await tx.couponCollection.deleteMany({ where: { couponId: c.id } });
      if (productIds.length) await tx.couponProduct.createMany({ data: productIds.map((productId) => ({ couponId: c.id, productId })) });
      if (collectionIds.length) await tx.couponCollection.createMany({ data: collectionIds.map((collectionId) => ({ couponId: c.id, collectionId })) });
      await audit({ actorId: u.id, action: id ? "coupon.update" : "coupon.create", entityType: "Coupon", entityId: c.id, after: data }, tx);
    });
    revalidatePath("/admin/discounts");
  }, "Discount saved.");
}

export async function toggleCouponAction(id: string, isActive: boolean) {
  return runAction(async () => {
    const u = await requirePermission("discounts.manage");
    await db.coupon.update({ where: { id }, data: { isActive } });
    await audit({ actorId: u.id, action: "coupon.toggle", entityType: "Coupon", entityId: id, after: { isActive } });
    revalidatePath("/admin/discounts");
  });
}

// ──────────────────────────────── Reviews ────────────────────────────────

export async function moderateReviewAction(id: string, status: "APPROVED" | "REJECTED") {
  return runAction(async () => {
    const u = await requirePermission("reviews.moderate");
    await moderateReview(id, status);
    await audit({ actorId: u.id, action: "review.moderate", entityType: "Review", entityId: id, after: { status } });
    revalidatePath("/admin/reviews");
  });
}
