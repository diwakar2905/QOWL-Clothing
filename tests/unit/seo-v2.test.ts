import { describe, it, expect } from "vitest";
import { itemListLd, listingFacts, organizationLd, storeFacts } from "@/lib/seo";
import { faqPageLd, storeFaq, type FaqInput } from "@/lib/faq";

const base: FaqInput = {
  brandName: "QOWL",
  description: "Independent streetwear for those who write their own code.",
  categories: ["T-shirts", "Hoodies"],
  sizes: ["S", "M", "L", "XL"],
  pricePaise: { min: 99900, max: 219900 },
  sizeGuideApproved: false,
  googleSignIn: false,
  shipping: { flatRatePaise: null, freeShippingThresholdPaise: null, deliverAllIndia: false, estimateMinDays: null, estimateMaxDays: null, dispatchNote: "" },
  returns: { allowReturns: false, allowExchanges: false, windowDays: null, policySummary: "" },
  payments: { onlineEnabled: true, codEnabled: false, codFeePaise: 0, codMinOrderPaise: null, codMaxOrderPaise: null },
  support: { email: "support@qowlstore.com", phone: "", hours: "" },
};
const qs = (f: FaqInput) => storeFaq(f).map((i) => i.q);

describe("storeFaq", () => {
  it("omits shipping, delivery and returns answers that are not configured", () => {
    const q = qs(base).join("\n");
    expect(q).not.toMatch(/ship/i);
    expect(q).not.toMatch(/delivery take/i);
    expect(q).not.toMatch(/return/i);
  });

  it("states configured shipping, delivery and returns facts", () => {
    const items = storeFaq({
      ...base,
      shipping: { ...base.shipping, flatRatePaise: 9900, freeShippingThresholdPaise: 199900, deliverAllIndia: true, estimateMinDays: 4, estimateMaxDays: 7 },
      returns: { allowReturns: true, allowExchanges: true, windowDays: 7, policySummary: "" },
    });
    const text = items.map((i) => i.a).join("\n");
    expect(text).toContain("We ship across India.");
    expect(text).toContain("free on orders of ₹1,999");
    expect(text).toContain("4–7 business days");
    expect(text).toContain("return or exchange within 7 days");
  });

  it("mentions COD and Google only when enabled", () => {
    expect(storeFaq(base).map((i) => i.a).join(" ")).not.toMatch(/cash on delivery|Google/);
    const on = storeFaq({ ...base, googleSignIn: true, payments: { ...base.payments, codEnabled: true, codFeePaise: 4900 } }).map((i) => i.a).join(" ");
    expect(on).toContain("cash on delivery");
    expect(on).toContain("₹49 fee");
  });

  it("keeps the T-shirt capital and the price range", () => {
    const text = storeFaq(base).map((i) => i.a).join(" ");
    expect(text).toContain("T-shirts and hoodies");
    expect(text).toContain("from ₹999 to ₹2,199");
  });

  it("builds FAQPage JSON-LD", () => {
    const ld = faqPageLd(storeFaq(base), "https://www.qowlstore.com/faq");
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]).toMatchObject({ "@type": "Question", acceptedAnswer: { "@type": "Answer" } });
  });
});

describe("listing helpers", () => {
  it("summarises listings", () => {
    expect(listingFacts(0, [])).toBe("");
    expect(listingFacts(1, [99900])).toBe("1 piece · from ₹999");
    expect(listingFacts(3, [219900, 189900])).toBe("3 pieces · from ₹1,899");
  });

  it("numbers ItemList positions across pages", () => {
    const ld = itemListLd("/category/hoodies", ["a", "b"], 24);
    expect(ld.itemListElement.map((i) => i.position)).toEqual([25, 26]);
  });

  it("adds slogan, email and area served to the organisation", () => {
    const org = organizationLd(storeFacts({
      store: { brandName: "QOWL", legalName: "", tagline: "Wear Your Own Code.", supportEmail: "support@qowlstore.com", supportPhone: "" },
      social: {}, shipping: {}, returns: { allowReturns: false },
    }));
    expect(org).toMatchObject({ slogan: "Wear Your Own Code", email: "support@qowlstore.com", areaServed: { name: "India" } });
  });
});
