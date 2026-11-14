import { describe, it, expect } from "vitest";
import { priceCart, inclusiveTax, taxRateFor, couponDiscount, unitPrice, isSaleActive } from "@/domain/pricing";

const apparel = { rateBps: 500, upperRateBps: 1800, thresholdPaise: 250000, hsnCode: "6109" };
const ship = { flatRatePaise: 9900, freeShippingThresholdPaise: null };

describe("GST", () => {
  it("extracts inclusive tax", () => {
    expect(inclusiveTax(105000, 500)).toBe(5000);
    expect(inclusiveTax(219900, 500)).toBe(10471);
    expect(inclusiveTax(0, 500)).toBe(0);
  });
  it("applies slab by per-piece value", () => {
    expect(taxRateFor(apparel, 250000)).toBe(500);
    expect(taxRateFor(apparel, 250001)).toBe(1800);
    expect(taxRateFor({ ...apparel, thresholdPaise: null }, 999999)).toBe(500);
  });
});

describe("priceCart", () => {
  it("totals lines, shipping and tax in integer paise", () => {
    const r = priceCart({ lines: [{ key: "a", unitPrice: 219900, quantity: 1, taxClass: apparel, couponEligible: true }], shipping: ship, sellerState: "Maharashtra", shipToState: "Maharashtra" });
    expect(r.subtotal).toBe(219900);
    expect(r.shippingTotal).toBe(9900);
    expect(r.grandTotal).toBe(229800);
    expect(r.taxTotal).toBe(10471 + inclusiveTax(9900, 500));
    expect(r.tax.mode).toBe("INTRA_STATE");
    expect(r.tax.cgst + r.tax.sgst).toBe(r.taxTotal);
  });
  it("uses IGST for inter-state and undetermined without seller state", () => {
    const line = [{ key: "a", unitPrice: 99900, quantity: 2, taxClass: apparel, couponEligible: true }];
    expect(priceCart({ lines: line, shipping: ship, sellerState: "Maharashtra", shipToState: "Karnataka" }).tax.mode).toBe("INTER_STATE");
    expect(priceCart({ lines: line, shipping: ship }).tax.mode).toBe("UNDETERMINED");
  });
  it("allocates discounts exactly across eligible lines and re-slabs after discount", () => {
    const r = priceCart({
      lines: [
        { key: "a", unitPrice: 260000, quantity: 1, taxClass: apparel, couponEligible: true },
        { key: "b", unitPrice: 99900, quantity: 3, taxClass: apparel, couponEligible: true },
        { key: "c", unitPrice: 50000, quantity: 1, taxClass: apparel, couponEligible: false },
      ],
      coupon: { type: "PERCENT", value: 10, maxDiscount: null },
      shipping: ship,
    });
    const eligible = 260000 + 299700;
    expect(r.discountTotal).toBe(Math.floor(eligible * 0.1));
    expect(r.lines.reduce((s, l) => s + l.lineDiscount, 0)).toBe(r.discountTotal);
    expect(r.lines.find((l) => l.key === "c")!.lineDiscount).toBe(0);
    // ₹2,600 piece discounted below ₹2,500 → 5% slab
    expect(r.lines.find((l) => l.key === "a")!.taxRateBps).toBe(500);
  });
  it("respects free-shipping threshold and unconfigured shipping", () => {
    const line = [{ key: "a", unitPrice: 200000, quantity: 1, taxClass: apparel, couponEligible: true }];
    expect(priceCart({ lines: line, shipping: { flatRatePaise: 9900, freeShippingThresholdPaise: 199900 } }).shippingTotal).toBe(0);
    const un = priceCart({ lines: line, shipping: { flatRatePaise: null, freeShippingThresholdPaise: null } });
    expect(un.shippingConfigured).toBe(false);
    expect(un.shippingTotal).toBe(0);
  });
  it("adds COD fee to total", () => {
    const r = priceCart({ lines: [{ key: "a", unitPrice: 100000, quantity: 1, taxClass: apparel, couponEligible: false }], shipping: ship, codFee: 4900 });
    expect(r.grandTotal).toBe(100000 + 9900 + 4900);
  });
  it("rejects invalid quantities and fractional prices", () => {
    expect(() => priceCart({ lines: [{ key: "a", unitPrice: 100.5, quantity: 1, taxClass: apparel, couponEligible: false }], shipping: ship })).toThrow();
    expect(() => priceCart({ lines: [{ key: "a", unitPrice: 100, quantity: 0, taxClass: apparel, couponEligible: false }], shipping: ship })).toThrow();
  });
});

describe("coupon discount", () => {
  it("caps percent discounts and never exceeds eligible subtotal", () => {
    expect(couponDiscount({ type: "PERCENT", value: 10, maxDiscount: 30000 }, 500000)).toBe(30000);
    expect(couponDiscount({ type: "FIXED", value: 50000, maxDiscount: null }, 20000)).toBe(20000);
  });
});

describe("unit price", () => {
  const p = { price: 129900, salePrice: 99900, saleStartsAt: new Date("2026-01-01"), saleEndsAt: new Date("2026-02-01") };
  it("honours sale windows and variant overrides", () => {
    expect(isSaleActive(p, new Date("2026-01-15"))).toBe(true);
    expect(unitPrice(p, null, new Date("2026-01-15"))).toBe(99900);
    expect(unitPrice(p, null, new Date("2026-03-01"))).toBe(129900);
    expect(unitPrice(p, { priceOverride: 140000 }, new Date("2026-01-15"))).toBe(140000);
  });
});
