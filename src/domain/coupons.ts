/** Pure coupon eligibility rules. Persistence/locking lives in the service. */
export type CouponRules = {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  minCartValue: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  scope: "ALL" | "PRODUCTS" | "COLLECTIONS";
};

export type CouponContext = {
  now: Date;
  subtotal: number;
  eligibleSubtotal: number;
  timesUsed: number;
  timesUsedByCustomer: number;
  isFirstOrder: boolean;
  hasCustomerIdentity: boolean;
};

export type CouponCheck = { ok: true } | { ok: false; code: string; message: string };

const fail = (code: string, message: string): CouponCheck => ({ ok: false, code, message });

export function checkCoupon(c: CouponRules, ctx: CouponContext, formatMoney: (p: number) => string): CouponCheck {
  if (!c.isActive) return fail("COUPON_INACTIVE", "This code is no longer active.");
  if (c.startsAt && c.startsAt > ctx.now) return fail("COUPON_NOT_STARTED", "This code isn't active yet.");
  if (c.endsAt && c.endsAt <= ctx.now) return fail("COUPON_EXPIRED", "This code has expired.");
  if (c.usageLimit != null && ctx.timesUsed >= c.usageLimit) return fail("COUPON_EXHAUSTED", "This code has reached its usage limit.");
  if (c.perCustomerLimit != null) {
    if (!ctx.hasCustomerIdentity) return fail("COUPON_NEEDS_IDENTITY", "Enter your email at checkout to use this code.");
    if (ctx.timesUsedByCustomer >= c.perCustomerLimit) return fail("COUPON_CUSTOMER_LIMIT", "You've already used this code.");
  }
  if (c.firstOrderOnly) {
    if (!ctx.hasCustomerIdentity) return fail("COUPON_NEEDS_IDENTITY", "Enter your email at checkout to use this code.");
    if (!ctx.isFirstOrder) return fail("COUPON_FIRST_ORDER", "This code is only valid on your first order.");
  }
  if (c.minCartValue != null && ctx.subtotal < c.minCartValue) {
    return fail("COUPON_MIN_VALUE", `Add ${formatMoney(c.minCartValue - ctx.subtotal)} more to use this code (minimum ${formatMoney(c.minCartValue)}).`);
  }
  if (c.scope !== "ALL" && ctx.eligibleSubtotal <= 0) return fail("COUPON_NOT_APPLICABLE", "This code doesn't apply to the items in your bag.");
  return { ok: true };
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
