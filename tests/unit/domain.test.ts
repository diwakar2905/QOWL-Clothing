import { describe, it, expect } from "vitest";
import { checkCoupon, normaliseCode } from "@/domain/coupons";
import { assertTransition, canTransition, ORDER_TRANSITIONS, FULFILLMENT_TRANSITIONS, RETURN_TRANSITIONS, InvalidTransitionError, customerStatusLabel } from "@/domain/state-machines";
import { canRequestReturn, refundForReturnedUnits, refundableAmount } from "@/domain/returns";
import { allocate, divRound, formatINR, rupeesToPaise } from "@/lib/money";

const base = { isActive: true, startsAt: null, endsAt: null, minCartValue: null, usageLimit: null, perCustomerLimit: null, firstOrderOnly: false, scope: "ALL" as const };
const ctx = { now: new Date("2026-06-01"), subtotal: 200000, eligibleSubtotal: 200000, timesUsed: 0, timesUsedByCustomer: 0, isFirstOrder: true, hasCustomerIdentity: true };
const fmt = (p: number) => String(p);

describe("coupon rules", () => {
  it("accepts a valid coupon", () => expect(checkCoupon(base, ctx, fmt).ok).toBe(true));
  it.each([
    [{ isActive: false }, {}, "COUPON_INACTIVE"],
    [{ startsAt: new Date("2026-07-01") }, {}, "COUPON_NOT_STARTED"],
    [{ endsAt: new Date("2026-05-01") }, {}, "COUPON_EXPIRED"],
    [{ usageLimit: 5 }, { timesUsed: 5 }, "COUPON_EXHAUSTED"],
    [{ perCustomerLimit: 1 }, { timesUsedByCustomer: 1 }, "COUPON_CUSTOMER_LIMIT"],
    [{ firstOrderOnly: true }, { isFirstOrder: false }, "COUPON_FIRST_ORDER"],
    [{ firstOrderOnly: true }, { hasCustomerIdentity: false }, "COUPON_NEEDS_IDENTITY"],
    [{ minCartValue: 300000 }, {}, "COUPON_MIN_VALUE"],
    [{ scope: "PRODUCTS" as const }, { eligibleSubtotal: 0 }, "COUPON_NOT_APPLICABLE"],
  ])("rejects %o", (rules, c, code) => {
    const r = checkCoupon({ ...base, ...rules }, { ...ctx, ...c }, fmt);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });
  it("normalises codes", () => expect(normaliseCode(" welcome 10 ")).toBe("WELCOME10"));
});

describe("state machines", () => {
  it("allows the happy path", () => {
    expect(canTransition(ORDER_TRANSITIONS, "PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransition(FULFILLMENT_TRANSITIONS, "SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransition(RETURN_TRANSITIONS, "RECEIVED", "INSPECTED")).toBe(true);
  });
  it("blocks illegal transitions", () => {
    expect(() => assertTransition("order", ORDER_TRANSITIONS, "CANCELLED", "CONFIRMED")).toThrow(InvalidTransitionError);
    expect(canTransition(FULFILLMENT_TRANSITIONS, "DELIVERED", "SHIPPED")).toBe(false);
    expect(canTransition(RETURN_TRANSITIONS, "REQUESTED", "INSPECTED")).toBe(false);
  });
  it("labels combined status for customers", () => {
    expect(customerStatusLabel({ status: "PROCESSING", paymentStatus: "PAID", fulfillmentStatus: "SHIPPED" })).toBe("Shipped");
    expect(customerStatusLabel({ status: "PENDING_PAYMENT", paymentStatus: "PENDING", fulfillmentStatus: "UNFULFILLED" })).toBe("Awaiting payment");
  });
});

describe("returns & refunds", () => {
  const policy = { allowReturns: true, allowExchanges: false, windowDays: 7 };
  const delivered = { status: "COMPLETED", fulfillmentStatus: "DELIVERED", deliveredAt: new Date("2026-06-01") };
  it("enforces window, delivery and type", () => {
    expect(canRequestReturn(policy, delivered, "RETURN", new Date("2026-06-05")).ok).toBe(true);
    expect(canRequestReturn(policy, delivered, "RETURN", new Date("2026-06-10")).ok).toBe(false);
    expect(canRequestReturn(policy, delivered, "EXCHANGE", new Date("2026-06-05")).ok).toBe(false);
    expect(canRequestReturn(policy, { ...delivered, fulfillmentStatus: "SHIPPED" }, "RETURN", new Date("2026-06-05")).ok).toBe(false);
    expect(canRequestReturn({ ...policy, windowDays: null }, delivered, "RETURN", new Date("2026-06-02")).ok).toBe(false);
  });
  it("computes refundable amounts", () => {
    expect(refundForReturnedUnits({ lineTotal: 300000, quantity: 3 }, 1)).toBe(100000);
    expect(refundForReturnedUnits({ lineTotal: 100001, quantity: 3 }, 3)).toBe(100001);
    expect(() => refundForReturnedUnits({ lineTotal: 100, quantity: 1 }, 2)).toThrow();
    expect(refundableAmount({ grandTotal: 100000, refundedTotal: 30000 }, 20000)).toBe(50000);
  });
});

describe("money", () => {
  it("allocates exactly", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
  });
  it("rounds and formats", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(rupeesToPaise("1,299.50")).toBe(129950);
    expect(formatINR(129900)).toBe("₹1,299");
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
  });
});

describe("coupon identity deferral", () => {
  it("lets guests apply identity-bound codes in the bag; checkout enforces them", () => {
    const rules = { ...base, firstOrderOnly: true, perCustomerLimit: 1 };
    expect(checkCoupon(rules, { ...ctx, hasCustomerIdentity: false, deferIdentityChecks: true }, fmt).ok).toBe(true);
    expect(checkCoupon(rules, { ...ctx, hasCustomerIdentity: false }, fmt).ok).toBe(false);
  });
});
