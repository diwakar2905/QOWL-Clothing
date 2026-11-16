import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { storeFaq } from "@/lib/faq";
import { getSettings } from "@/server/services/settings";
import { visibleProductWhere } from "@/server/services/catalog";
import { isGoogleEnabled } from "@/server/auth/google";

/** Live FAQ for /faq and /llms.txt, built from Settings and the visible catalogue. */
export const getStoreFaq = cache(async () => {
  const [s, products, categories, guides] = await Promise.all([
    getSettings(),
    db.product.findMany({
      where: visibleProductWhere(),
      select: { price: true, variants: { where: { isActive: true }, select: { size: true, sizeRank: true, priceOverride: true } } },
    }),
    db.category.findMany({ where: { isActive: true, products: { some: visibleProductWhere() } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
    db.sizeGuide.count({ where: { isApproved: true } }),
  ]);
  const prices = products.flatMap((p) => (p.variants.length ? p.variants.map((v) => v.priceOverride ?? p.price) : [p.price]));
  const rank = new Map<string, number>();
  for (const v of products.flatMap((p) => p.variants)) rank.set(v.size, Math.min(rank.get(v.size) ?? Infinity, v.sizeRank));
  const sizes = [...rank.entries()].sort((a, b) => a[1] - b[1]).map(([size]) => size);
  const st = s.store;
  return storeFaq({
    brandName: st.brandName,
    description: st.description,
    categories: categories.map((c) => c.name),
    sizes,
    pricePaise: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    sizeGuideApproved: guides > 0,
    googleSignIn: isGoogleEnabled(),
    shipping: {
      flatRatePaise: s.shipping.flatRatePaise ?? null,
      freeShippingThresholdPaise: s.shipping.freeShippingThresholdPaise ?? null,
      deliverAllIndia: s.shipping.deliverAllIndia,
      estimateMinDays: s.shipping.estimateMinDays ?? null,
      estimateMaxDays: s.shipping.estimateMaxDays ?? null,
      dispatchNote: s.shipping.dispatchNote,
    },
    returns: { allowReturns: s.returns.allowReturns, allowExchanges: s.returns.allowExchanges, windowDays: s.returns.windowDays ?? null, policySummary: s.returns.policySummary },
    payments: {
      onlineEnabled: s.payments.onlineEnabled,
      codEnabled: s.payments.codEnabled,
      codFeePaise: s.payments.codFeePaise,
      codMinOrderPaise: s.payments.codMinOrderPaise ?? null,
      codMaxOrderPaise: s.payments.codMaxOrderPaise ?? null,
    },
    support: { email: st.supportEmail, phone: st.supportPhone, hours: st.supportHours },
  });
});
