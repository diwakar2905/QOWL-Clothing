import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "./settings";

const PAID = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "COD_COLLECTED"] as const;

/** All metrics come from real orders/payments/refunds; nothing is estimated or seeded. */
export async function dashboardMetrics(from: Date, to: Date) {
  const paidWhere = { paymentStatus: { in: [...PAID] }, confirmedAt: { gte: from, lt: to } };
  const [paidAgg, units, refunds, failures, pendingFulfillment, openReturns, onHold, top] = await Promise.all([
    db.order.aggregate({ where: paidWhere, _sum: { grandTotal: true, refundedTotal: true, taxTotal: true, shippingTotal: true }, _count: true }),
    db.orderItem.aggregate({ where: { order: paidWhere }, _sum: { quantity: true } }),
    db.refund.aggregate({ where: { status: "PROCESSED", processedAt: { gte: from, lt: to } }, _sum: { amount: true }, _count: true }),
    db.payment.count({ where: { status: "FAILED", updatedAt: { gte: from, lt: to } } }),
    db.order.count({ where: { status: { in: ["CONFIRMED", "PROCESSING"] }, fulfillmentStatus: { in: ["UNFULFILLED", "PACKED", "READY_TO_SHIP"] } } }),
    db.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "IN_TRANSIT", "RECEIVED", "INSPECTED", "REFUND_PENDING"] } } }),
    db.order.count({ where: { status: { in: ["ON_HOLD", "CANCELLATION_REQUESTED"] } } }),
    db.orderItem.groupBy({ by: ["productName"], where: { order: paidWhere }, _sum: { quantity: true, lineTotal: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
  ]);
  const codPending = await db.order.aggregate({ where: { paymentStatus: "COD_PENDING", confirmedAt: { gte: from, lt: to } }, _sum: { grandTotal: true }, _count: true });
  const gross = paidAgg._sum.grandTotal ?? 0;
  const series = await db.$queryRaw<{ day: Date; total: bigint; orders: bigint }[]>`
    SELECT date_trunc('day', "confirmedAt" AT TIME ZONE 'Asia/Kolkata') AS day, SUM("grandTotal")::bigint AS total, COUNT(*)::bigint AS orders
    FROM "Order" WHERE "paymentStatus" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED','COD_COLLECTED') AND "confirmedAt" >= ${from} AND "confirmedAt" < ${to}
    GROUP BY 1 ORDER BY 1`;
  return {
    grossRevenue: gross,
    netRevenue: gross - (paidAgg._sum.refundedTotal ?? 0),
    taxCollected: paidAgg._sum.taxTotal ?? 0,
    paidOrders: paidAgg._count,
    aov: paidAgg._count ? Math.round(gross / paidAgg._count) : 0,
    unitsSold: units._sum.quantity ?? 0,
    refundsProcessed: refunds._sum.amount ?? 0,
    refundCount: refunds._count,
    paymentFailures: failures,
    pendingFulfillment,
    openReturns,
    needsAttention: onHold,
    codPending: { count: codPending._count, amount: codPending._sum.grandTotal ?? 0 },
    topProducts: top.map((t) => ({ name: t.productName, units: t._sum.quantity ?? 0, revenue: t._sum.lineTotal ?? 0 })),
    series: series.map((s) => ({ day: s.day, total: Number(s.total), orders: Number(s.orders) })),
  };
}

export async function lowStock(limit = 12) {
  return db.$queryRaw<{ sku: string; productName: string; color: string; size: string; available: number; threshold: number; productId: string }[]>`
    SELECT v.sku, p.name AS "productName", c.name AS color, v.size, (il."onHand" - il.reserved)::int AS available, il."lowStockThreshold" AS threshold, p.id AS "productId"
    FROM "InventoryLevel" il JOIN "ProductVariant" v ON v.id = il."variantId" JOIN "Product" p ON p.id = v."productId" JOIN "ProductColor" c ON c.id = v."colorId"
    WHERE v."isActive" AND p.status = 'ACTIVE' AND (il."onHand" - il.reserved) <= il."lowStockThreshold"
    ORDER BY available ASC, p.name LIMIT ${limit}`;
}

/** Items that must be configured/verified before accepting real orders. */
export async function launchChecklist() {
  const s = await getSettings();
  const [unreviewedTax, draftLegal, activeFixtures, activeProducts] = await Promise.all([
    db.taxClass.count({ where: { reviewedAt: null } }),
    db.page.count({ where: { slug: { in: ["shipping-policy", "returns-and-exchanges", "privacy-policy", "terms-of-service", "grievance-redressal"] }, status: { not: "ACTIVE" } } }),
    db.product.count({ where: { isFixture: true, status: "ACTIVE" } }),
    db.product.count({ where: { status: "ACTIVE" } }),
  ]);
  const env = process.env;
  return [
    { label: "Legal entity name, GSTIN and seller state", ok: !!(s.store.legalName && s.store.gstin && s.store.sellerState) },
    { label: "Customer care email/phone", ok: !!(s.store.supportEmail || s.store.supportPhone) },
    { label: "Grievance officer details", ok: !!(s.store.grievanceOfficerName && s.store.grievanceOfficerEmail) },
    { label: "Shipping rate configured", ok: s.shipping.flatRatePaise != null },
    { label: "Delivery coverage configured", ok: s.shipping.deliverAllIndia || s.shipping.serviceablePincodePrefixes.length > 0 || env.SHIPPING_PROVIDER === "shiprocket" },
    { label: "Return policy & window configured", ok: s.returns.windowDays != null && !!s.returns.policySummary },
    { label: "Tax classes reviewed by an advisor", ok: unreviewedTax === 0 && s.tax.reviewedByAdvisor },
    { label: "Policy pages written, reviewed and published", ok: draftLegal === 0 },
    { label: "Live Razorpay keys configured", ok: env.PAYMENT_PROVIDER === "razorpay" && !!env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") },
    { label: "Transactional email provider configured", ok: env.EMAIL_PROVIDER === "resend" },
    { label: "Cloud image storage configured", ok: env.STORAGE_DRIVER === "s3" },
    { label: "No development fixture products are active", ok: activeFixtures === 0 },
    { label: "At least one real product published", ok: activeProducts - activeFixtures > 0 },
  ];
}
