import "server-only";
import { db, type Tx } from "@/lib/db";
import { checkCoupon, normaliseCode, type CouponCheck } from "@/domain/coupons";
import { formatINR } from "@/lib/money";
import type { Coupon } from "@/generated/prisma/client";

export type CouponLineContext = { key: string; productId: string; lineSubtotal: number };

export type CouponEvaluation =
  | { ok: true; coupon: Coupon; eligibleKeys: Set<string> }
  | { ok: false; code: string; message: string; coupon?: Coupon };

/**
 * Validate a coupon for a set of cart lines. When `lockForUpdate` is set
 * (checkout), the coupon row is locked so concurrent orders cannot exceed
 * usage limits.
 */
export async function evaluateCoupon(
  codeRaw: string,
  lines: CouponLineContext[],
  customer: { email?: string | null; userId?: string | null },
  opts: { tx?: Tx; lockForUpdate?: boolean; excludeOrderId?: string; deferIdentityChecks?: boolean } = {},
): Promise<CouponEvaluation> {
  const client = opts.tx ?? db;
  const code = normaliseCode(codeRaw);
  if (!code || code.length > 40) return { ok: false, code: "COUPON_INVALID", message: "Enter a valid code." };
  if (opts.lockForUpdate && opts.tx) {
    await opts.tx.$queryRaw`SELECT id FROM "Coupon" WHERE code = ${code} FOR UPDATE`;
  }
  const coupon = await client.coupon.findUnique({ where: { code }, include: { products: true, collections: true } });
  if (!coupon) return { ok: false, code: "COUPON_INVALID", message: "This code isn't valid." };

  let eligibleKeys = new Set(lines.map((l) => l.key));
  if (coupon.scope === "PRODUCTS") {
    const allowed = new Set(coupon.products.map((p) => p.productId));
    eligibleKeys = new Set(lines.filter((l) => allowed.has(l.productId)).map((l) => l.key));
  } else if (coupon.scope === "COLLECTIONS") {
    const links = await client.collectionProduct.findMany({ where: { collectionId: { in: coupon.collections.map((c) => c.collectionId) } }, select: { productId: true } });
    const allowed = new Set(links.map((l) => l.productId));
    eligibleKeys = new Set(lines.filter((l) => allowed.has(l.productId)).map((l) => l.key));
  }
  const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
  const eligibleSubtotal = lines.filter((l) => eligibleKeys.has(l.key)).reduce((s, l) => s + l.lineSubtotal, 0);

  const live = { couponId: coupon.id, status: { in: ["RESERVED", "COMMITTED"] as ("RESERVED" | "COMMITTED")[] }, ...(opts.excludeOrderId ? { orderId: { not: opts.excludeOrderId } } : {}) };
  const timesUsed = await client.couponRedemption.count({ where: live });
  const email = customer.email?.toLowerCase() ?? null;
  const identity = !!(email || customer.userId);
  const idFilter = [...(email ? [{ email }] : []), ...(customer.userId ? [{ userId: customer.userId }] : [])];
  const timesUsedByCustomer = identity ? await client.couponRedemption.count({ where: { ...live, OR: idFilter } }) : 0;
  const priorOrders = identity
    ? await client.order.count({ where: { OR: idFilter, paymentStatus: { in: ["PAID", "COD_PENDING", "COD_COLLECTED", "PARTIALLY_REFUNDED", "REFUNDED"] } } })
    : 0;

  const check: CouponCheck = checkCoupon(
    coupon,
    { now: new Date(), subtotal, eligibleSubtotal, timesUsed, timesUsedByCustomer, isFirstOrder: priorOrders === 0, hasCustomerIdentity: identity, deferIdentityChecks: opts.deferIdentityChecks },
    formatINR,
  );
  if (!check.ok) return { ok: false, code: check.code, message: check.message, coupon };
  return { ok: true, coupon, eligibleKeys };
}
