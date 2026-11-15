/* eslint-disable @typescript-eslint/no-explicit-any -- assertions walk loosely-typed JSON-LD objects */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isIndexable, listingCanonical, metaDescription, productLd, productTitle, returnPolicyLd, storeFacts, variantUrl } from "@/lib/seo";

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

describe("indexing policy", () => {
  beforeEach(() => {
    Object.assign(process.env, { NODE_ENV: "production", APP_URL: "https://qowl.example" });
    delete process.env.VERCEL_ENV;
    delete process.env.ALLOW_INDEXING;
  });
  it("indexes only the production host", () => {
    expect(isIndexable("qowl.example")).toBe(true);
    expect(isIndexable("qowl-git-feature-team.vercel.app")).toBe(false);
    expect(isIndexable("staging.qowl.example")).toBe(false);
  });
  it("never indexes previews, opt-outs, localhost or development", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isIndexable("qowl.example")).toBe(false);
    process.env.VERCEL_ENV = "production";
    process.env.ALLOW_INDEXING = "false";
    expect(isIndexable("qowl.example")).toBe(false);
    delete process.env.ALLOW_INDEXING;
    process.env.APP_URL = "http://localhost:3000";
    expect(isIndexable("localhost:3000")).toBe(false);
    Object.assign(process.env, { NODE_ENV: "development", APP_URL: "https://qowl.example" });
    expect(isIndexable("qowl.example")).toBe(false);
  });
});

describe("titles, descriptions, canonicals", () => {
  it("says what the product is, and respects a real admin override", () => {
    expect(productTitle({ name: "Eclipse", garmentType: "Pullover hoodie", seoTitle: null, subtitle: "The Statement Hoodie" })).toBe("Eclipse Pullover Hoodie");
    expect(productTitle({ name: "Eclipse", garmentType: "Pullover hoodie", seoTitle: "Eclipse — The Statement Hoodie", subtitle: "The Statement Hoodie" })).toBe("Eclipse Pullover Hoodie");
    expect(productTitle({ name: "Origin", garmentType: "Oversized T-shirt", seoTitle: null, subtitle: null })).toBe("Origin Oversized T-shirt");
    expect(productTitle({ name: "Eclipse", garmentType: "Pullover hoodie", seoTitle: "Custom title", subtitle: "x" })).toBe("Custom title");
  });
  it("trims descriptions on a word boundary and strips markdown", () => {
    const d = metaDescription(`**Bold** ${"word ".repeat(60)}`);
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).not.toContain("*");
    expect(d.endsWith("…")).toBe(true);
  });
  it("collapses sort/filter params but keeps pagination", () => {
    expect(listingCanonical("/category/hoodies", {})).toBe("/category/hoodies");
    expect(listingCanonical("/category/hoodies", { page: "1" })).toBe("/category/hoodies");
    expect(listingCanonical("/category/hoodies", { page: "3" })).toBe("/category/hoodies?page=3");
    expect(listingCanonical("/category/hoodies", { page: "abc" })).toBe("/category/hoodies");
  });
});

const settings = (over: Partial<{ allowReturns: boolean; windowDays: number | null; flatRatePaise: number | null; free: number | null }> = {}) =>
  storeFacts({
    store: { brandName: "QOWL", legalName: "", description: "Independent streetwear.", supportEmail: "care@qowl.example", supportPhone: "" },
    social: { instagram: "https://instagram.com/qowl", x: "" },
    shipping: { flatRatePaise: "flatRatePaise" in over ? over.flatRatePaise! : 9900, freeShippingThresholdPaise: "free" in over ? over.free! : 199900 },
    returns: { allowReturns: over.allowReturns ?? true, windowDays: over.windowDays === undefined ? 7 : over.windowDays },
  });

const product = (over: Record<string, unknown> = {}) => ({
  name: "Eclipse",
  slug: "eclipse",
  styleCode: "QWL-HD-002",
  description: "Statement hoodie.",
  garmentType: "Pullover hoodie",
  fabric: "100% cotton fleece",
  detailsApproved: false,
  countryOfOrigin: "India",
  category: { name: "Hoodies" },
  colors: [{ id: "c1", name: "Forest Green", slug: "forest-green" }, { id: "c2", name: "Black", slug: "black" }],
  images: [{ url: "/concept/eclipse-front.webp", alt: "front", colorId: "c1" }, { url: "https://cdn.example/black.webp", alt: "black", colorId: "c2" }],
  variants: [
    { colorId: "c1", size: "M", sku: "QWL-HD-002-FGN-M", price: 219900, available: 4 },
    { colorId: "c2", size: "L", sku: "QWL-HD-002-BLK-L", price: 219900, available: 0 },
  ],
  rating: null,
  ...over,
});

describe("product structured data", () => {
  beforeEach(() => { process.env.APP_URL = "https://qowl.example"; });

  it("builds a valid ProductGroup with one Product+Offer per variant", () => {
    const ld = productLd(product(), settings()) as Record<string, any>;
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.productGroupID).toBe("QWL-HD-002");
    expect(ld.variesBy).toEqual(["https://schema.org/size", "https://schema.org/color"]);
    expect(ld.hasVariant).toHaveLength(2);
    const [m, l] = ld.hasVariant;
    // Google merchant-listing required/recommended fields
    for (const v of [m, l]) {
      expect(v["@type"]).toBe("Product");
      expect(v.sku).toMatch(/^QWL-HD-002-/);
      expect(v.image.length).toBeGreaterThan(0);
      expect(v.image.every((u: string) => u.startsWith("https://"))).toBe(true);
      expect(v.offers.priceCurrency).toBe("INR");
      expect(v.offers.price).toBe("2199.00");
      expect(v.offers.itemCondition).toBe("https://schema.org/NewCondition");
    }
    expect(m.offers.availability).toBe("https://schema.org/InStock");
    expect(l.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(m.offers.url).toBe("https://qowl.example/products/eclipse?color=forest-green&size=M");
    expect(m.color).toBe("Forest Green");
    expect(m.image[0]).toBe("https://qowl.example/concept/eclipse-front.webp");
    expect(l.image[0]).toBe("https://cdn.example/black.webp");
    // free shipping above the threshold, return policy from Settings
    expect(m.offers.shippingDetails.shippingRate.value).toBe("0.00");
    expect(m.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(7);
  });

  it("never invents ratings, material or policies", () => {
    const ld = productLd(product(), settings({ allowReturns: false, flatRatePaise: null })) as Record<string, any>;
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.material).toBeUndefined(); // details not approved yet
    expect(ld.hasVariant[0].offers.shippingDetails).toBeUndefined();
    expect(ld.hasVariant[0].offers.hasMerchantReturnPolicy).toBeUndefined();
    expect(returnPolicyLd(settings({ windowDays: null }))).toBeNull();
    const approved = productLd(product({ detailsApproved: true, rating: { average: 4.5, count: 3 } }), settings()) as Record<string, any>;
    expect(approved.material).toBe("100% cotton fleece");
    expect(approved.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 3 });
  });

  it("uses a plain Product for single-variant items and charges flat shipping below the threshold", () => {
    const ld = productLd(product({ variants: [{ colorId: "c1", size: "OS", sku: "QWL-ACC-1", price: 59900, available: 1 }] }), settings()) as Record<string, any>;
    expect(ld["@type"]).toBe("Product");
    expect(ld.sku).toBe("QWL-ACC-1");
    expect(ld.offers.shippingDetails.shippingRate.value).toBe("99.00");
  });

  it("builds variant URLs that the product page understands", () => {
    expect(variantUrl("origin", "black", "XL")).toBe("https://qowl.example/products/origin?color=black&size=XL");
    expect(variantUrl("origin")).toBe("https://qowl.example/products/origin");
  });
});
