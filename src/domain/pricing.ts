/**
 * Pure pricing & GST engine. All inputs/outputs are integer paise.
 * Selling prices are GST-inclusive (Indian MRP convention), so tax is
 * extracted from the price rather than added on top.
 */
import { allocate, divRound } from "@/lib/money";

export type TaxClassLike = { rateBps: number; upperRateBps: number | null; thresholdPaise: number | null; hsnCode: string };

export type PriceSource = { price: number; salePrice: number | null; saleStartsAt: Date | null; saleEndsAt: Date | null };

export function isSaleActive(p: PriceSource, now = new Date()): boolean {
  if (p.salePrice == null) return false;
  if (p.saleStartsAt && p.saleStartsAt > now) return false;
  if (p.saleEndsAt && p.saleEndsAt <= now) return false;
  return true;
}

export function unitPrice(p: PriceSource, variant?: { priceOverride: number | null } | null, now = new Date()): number {
  if (variant?.priceOverride != null) return variant.priceOverride;
  return isSaleActive(p, now) ? p.salePrice! : p.price;
}

/** GST rate for a single unit's transaction value (slab-based for apparel). */
export function taxRateFor(tc: TaxClassLike, unitValuePaise: number): number {
  if (tc.thresholdPaise != null && tc.upperRateBps != null && unitValuePaise > tc.thresholdPaise) return tc.upperRateBps;
  return tc.rateBps;
}

/** Tax contained in a GST-inclusive amount. */
export function inclusiveTax(amount: number, rateBps: number): number {
  if (amount <= 0 || rateBps <= 0) return 0;
  return divRound(amount * rateBps, 10000 + rateBps);
}

export type PricingLine = {
  key: string;
  unitPrice: number;
  quantity: number;
  taxClass: TaxClassLike;
  couponEligible: boolean;
};

export type CouponLike = { type: "PERCENT" | "FIXED"; value: number; maxDiscount: number | null };

export type ShippingRule = { flatRatePaise: number | null; freeShippingThresholdPaise: number | null };

export type PricingInput = {
  lines: PricingLine[];
  coupon?: CouponLike | null;
  shipping: ShippingRule;
  codFee?: number;
  shippingTaxMode?: "HIGHEST_LINE_RATE" | "NONE";
  sellerState?: string | null;
  shipToState?: string | null;
};

export type PricedLine = PricingLine & {
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  taxRateBps: number;
  taxAmount: number;
};

export type PricingResult = {
  lines: PricedLine[];
  subtotal: number;
  eligibleSubtotal: number;
  discountTotal: number;
  shippingTotal: number;
  shippingConfigured: boolean;
  codFee: number;
  taxTotal: number;
  grandTotal: number;
  tax: { mode: "INTRA_STATE" | "INTER_STATE" | "UNDETERMINED"; cgst: number; sgst: number; igst: number; shippingTax: number };
};

export function couponDiscount(coupon: CouponLike, eligibleSubtotal: number): number {
  if (eligibleSubtotal <= 0) return 0;
  let d = coupon.type === "PERCENT" ? Math.floor((eligibleSubtotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount != null) d = Math.min(d, coupon.maxDiscount);
  return Math.max(0, Math.min(d, eligibleSubtotal));
}

export function priceCart(input: PricingInput): PricingResult {
  const lines = input.lines.map((l) => {
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw new Error("unitPrice must be a non-negative integer (paise)");
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("quantity must be a positive integer");
    return { ...l, lineSubtotal: l.unitPrice * l.quantity };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
  const eligible = lines.filter((l) => l.couponEligible);
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.lineSubtotal, 0);
  const discountTotal = input.coupon ? couponDiscount(input.coupon, eligibleSubtotal) : 0;
  const allocations = allocate(discountTotal, eligible.map((l) => l.lineSubtotal));
  const discountByKey = new Map(eligible.map((l, i) => [l.key, allocations[i]!]));

  const priced: PricedLine[] = lines.map((l) => {
    const lineDiscount = discountByKey.get(l.key) ?? 0;
    const lineTotal = l.lineSubtotal - lineDiscount;
    // Slab is determined by the per-piece transaction value after discount.
    const perUnit = Math.floor(lineTotal / l.quantity);
    const taxRateBps = taxRateFor(l.taxClass, perUnit);
    return { ...l, lineDiscount, lineTotal, taxRateBps, taxAmount: inclusiveTax(lineTotal, taxRateBps) };
  });

  const merchandise = subtotal - discountTotal;
  const shippingConfigured = input.shipping.flatRatePaise != null;
  let shippingTotal = 0;
  if (shippingConfigured && priced.length > 0) {
    const free = input.shipping.freeShippingThresholdPaise != null && merchandise >= input.shipping.freeShippingThresholdPaise;
    shippingTotal = free ? 0 : input.shipping.flatRatePaise!;
  }
  const codFee = input.codFee ?? 0;
  const highestRate = priced.reduce((m, l) => Math.max(m, l.taxRateBps), 0);
  const chargesRate = (input.shippingTaxMode ?? "HIGHEST_LINE_RATE") === "HIGHEST_LINE_RATE" ? highestRate : 0;
  const shippingTax = inclusiveTax(shippingTotal + codFee, chargesRate);
  const taxTotal = priced.reduce((s, l) => s + l.taxAmount, 0) + shippingTax;

  let mode: PricingResult["tax"]["mode"] = "UNDETERMINED";
  if (input.sellerState && input.shipToState) mode = input.sellerState === input.shipToState ? "INTRA_STATE" : "INTER_STATE";
  const cgst = mode === "INTRA_STATE" ? Math.floor(taxTotal / 2) : 0;
  const sgst = mode === "INTRA_STATE" ? taxTotal - cgst : 0;
  const igst = mode === "INTRA_STATE" ? 0 : taxTotal;

  return {
    lines: priced,
    subtotal,
    eligibleSubtotal,
    discountTotal,
    shippingTotal,
    shippingConfigured,
    codFee,
    taxTotal,
    grandTotal: merchandise + shippingTotal + codFee,
    tax: { mode, cgst, sgst, igst, shippingTax },
  };
}
