/**
 * Search-engine helpers: canonical site URL, which deployments may be indexed,
 * and Schema.org JSON-LD builders. Everything here is derived from real catalogue
 * and Settings data — nothing is invented (no ratings without reviews, no
 * material until product details are approved, no delivery times unless set).
 */

export const BRAND = "QOWL";

/** Canonical origin of the production site, e.g. https://qowlclothing.vercel.app */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl()}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function appHost(): string | null {
  try {
    return new URL(siteUrl()).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether this deployment/host may be indexed. Only the production build serving
 * the APP_URL host is indexable. Vercel preview URLs, staging hosts, localhost and
 * ALLOW_INDEXING=false are all excluded. Works even when Vercel's system env vars
 * are not exposed, because it compares the request host with APP_URL.
 */
export function isIndexable(host?: string | null): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.ALLOW_INDEXING === "false") return false;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return false;
  const expected = appHost();
  if (!expected || /^(localhost|127\.)/.test(expected)) return false;
  if (host == null) return true;
  return host.toLowerCase().split(":")[0] === expected.split(":")[0];
}

/** "Eclipse — The Statement Hoodie" → "Eclipse Pullover Hoodie" (what the item is). */
export function productTitle(p: { name: string; garmentType: string; seoTitle: string | null; subtitle: string | null }): string {
  // The development seed wrote `${name} — ${subtitle}` into seoTitle; treat that as "not set".
  const seeded = p.subtitle ? `${p.name} — ${p.subtitle}` : null;
  if (p.seoTitle && p.seoTitle !== seeded) return p.seoTitle;
  const type = p.garmentType.trim();
  return type && !p.name.toLowerCase().includes(type.toLowerCase()) ? `${p.name} ${capitalise(type)}` : p.name;
}

function capitalise(s: string) {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bT-Shirt\b/, "T-shirt");
}

export function metaDescription(text: string, max = 155): string {
  const clean = text.replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 80)).trim()}…`;
}

// ───────────────────────── Structured data ─────────────────────────

const AVAILABILITY = { in: "https://schema.org/InStock", out: "https://schema.org/OutOfStock" } as const;
const rupees = (paise: number) => (paise / 100).toFixed(2);

export type StoreFacts = {
  brandName: string;
  legalName: string;
  description: string;
  supportEmail: string;
  supportPhone: string;
  social: string[];
  shipping: { flatRatePaise: number | null; freeShippingThresholdPaise: number | null };
  returns: { allowReturns: boolean; windowDays: number | null };
};

export function storeFacts(settings: {
  store: { brandName: string; legalName: string; description?: string; supportEmail: string; supportPhone: string };
  social: Record<string, string | null | undefined>;
  shipping: { flatRatePaise?: number | null; freeShippingThresholdPaise?: number | null };
  returns: { allowReturns: boolean; windowDays?: number | null };
}): StoreFacts {
  return {
    brandName: settings.store.brandName || BRAND,
    legalName: settings.store.legalName,
    description: settings.store.description ?? "",
    supportEmail: settings.store.supportEmail,
    supportPhone: settings.store.supportPhone,
    social: Object.values(settings.social).filter((u): u is string => !!u),
    shipping: { flatRatePaise: settings.shipping.flatRatePaise ?? null, freeShippingThresholdPaise: settings.shipping.freeShippingThresholdPaise ?? null },
    returns: { allowReturns: settings.returns.allowReturns, windowDays: settings.returns.windowDays ?? null },
  };
}

export function returnPolicyLd(f: StoreFacts) {
  // Only published when returns are actually switched on with a window; an
  // unconfigured store can't be told apart from "no returns", so we say nothing.
  if (!f.returns.allowReturns || !f.returns.windowDays) return null;
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "IN",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: f.returns.windowDays,
    returnMethod: "https://schema.org/ReturnByMail",
    merchantReturnLink: absoluteUrl("/pages/returns-and-exchanges"),
  };
}

function shippingLd(f: StoreFacts, pricePaise: number) {
  const { flatRatePaise, freeShippingThresholdPaise } = f.shipping;
  if (flatRatePaise == null) return null;
  const free = freeShippingThresholdPaise != null && pricePaise >= freeShippingThresholdPaise;
  return {
    "@type": "OfferShippingDetails",
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
    shippingRate: { "@type": "MonetaryAmount", value: free ? "0.00" : rupees(flatRatePaise), currency: "INR" },
  };
}

export function organizationLd(f: StoreFacts) {
  const base = siteUrl();
  const contact = f.supportEmail || f.supportPhone
    ? [{ "@type": "ContactPoint", contactType: "customer support", areaServed: "IN", availableLanguage: ["en"], ...(f.supportEmail ? { email: f.supportEmail } : {}), ...(f.supportPhone ? { telephone: f.supportPhone } : {}) }]
    : undefined;
  const returns = returnPolicyLd(f);
  return {
    "@type": "OnlineStore",
    "@id": `${base}/#organization`,
    name: f.brandName,
    ...(f.legalName && f.legalName !== f.brandName ? { legalName: f.legalName } : {}),
    url: `${base}/`,
    logo: { "@type": "ImageObject", url: `${base}/brand/icon-512.png`, width: 512, height: 512 },
    ...(f.description ? { description: f.description } : {}),
    ...(f.social.length ? { sameAs: f.social } : {}),
    ...(contact ? { contactPoint: contact } : {}),
    ...(returns ? { hasMerchantReturnPolicy: returns } : {}),
  };
}

export function websiteLd(f: StoreFacts) {
  const base = siteUrl();
  return { "@type": "WebSite", "@id": `${base}/#website`, url: `${base}/`, name: f.brandName, inLanguage: "en-IN", publisher: { "@id": `${base}/#organization` } };
}

type LdProduct = {
  name: string;
  slug: string;
  styleCode: string;
  description: string;
  garmentType: string;
  fabric: string | null;
  detailsApproved: boolean;
  countryOfOrigin: string | null;
  category: { name: string };
  colors: { id: string; name: string; slug: string }[];
  images: { url: string; alt: string; colorId: string | null }[];
  variants: { colorId: string; size: string; sku: string; price: number; available: number }[];
  rating: { average: number; count: number } | null;
};

export function variantUrl(slug: string, color?: string | null, size?: string | null) {
  const q = new URLSearchParams();
  if (color) q.set("color", color);
  if (size) q.set("size", size);
  const qs = q.toString();
  return absoluteUrl(`/products/${slug}${qs ? `?${qs}` : ""}`);
}

/**
 * ProductGroup with one Product per colour × size (Google "product variants"
 * guidance). Prices/stock come from the same data the PDP and checkout use.
 */
export function productLd(p: LdProduct, f: StoreFacts) {
  const base = siteUrl();
  const url = absoluteUrl(`/products/${p.slug}`);
  const allImages = p.images.map((i) => absoluteUrl(i.url));
  const imagesFor = (colorId: string) => {
    const own = p.images.filter((i) => i.colorId === colorId).map((i) => absoluteUrl(i.url));
    return (own.length ? own : allImages).slice(0, 6);
  };
  const returns = returnPolicyLd(f);
  const common = {
    brand: { "@type": "Brand", name: f.brandName },
    ...(p.detailsApproved && p.fabric ? { material: p.fabric } : {}),
    ...(p.countryOfOrigin ? { countryOfOrigin: p.countryOfOrigin } : {}),
    category: p.category.name,
  };
  const offerFor = (v: LdProduct["variants"][number], color: { slug: string } | undefined) => {
    const ship = shippingLd(f, v.price);
    return {
      "@type": "Offer",
      url: variantUrl(p.slug, color?.slug, v.size),
      priceCurrency: "INR",
      price: rupees(v.price),
      availability: v.available > 0 ? AVAILABILITY.in : AVAILABILITY.out,
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${base}/#organization` },
      ...(ship ? { shippingDetails: ship } : {}),
      ...(returns ? { hasMerchantReturnPolicy: returns } : {}),
    };
  };
  const rating = p.rating && p.rating.count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating.average, reviewCount: p.rating.count } } : {};
  const colorById = new Map(p.colors.map((c) => [c.id, c]));

  if (p.variants.length <= 1) {
    const v = p.variants[0];
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}#product`,
      name: p.name,
      description: p.description,
      url,
      sku: v?.sku ?? p.styleCode,
      image: allImages.slice(0, 6),
      ...common,
      ...(v ? { offers: offerFor(v, colorById.get(v.colorId)) } : {}),
      ...rating,
    };
  }

  const sizes = new Set(p.variants.map((v) => v.size));
  const colorIds = new Set(p.variants.map((v) => v.colorId));
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${url}#product`,
    name: p.name,
    description: p.description,
    url,
    productGroupID: p.styleCode,
    image: allImages.slice(0, 6),
    variesBy: [...(sizes.size > 1 ? ["https://schema.org/size"] : []), ...(colorIds.size > 1 ? ["https://schema.org/color"] : [])],
    ...common,
    ...rating,
    hasVariant: p.variants.map((v) => {
      const color = colorById.get(v.colorId);
      return {
        "@type": "Product",
        sku: v.sku,
        name: [p.name, color?.name, v.size].filter(Boolean).join(" – "),
        image: imagesFor(v.colorId),
        ...(color ? { color: color.name } : {}),
        size: v.size,
        offers: offerFor(v, color),
      };
    }),
  };
}

export function graph(...nodes: (Record<string, unknown> | null)[]) {
  return { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) };
}

/**
 * Canonical for product listings: sort/filter params collapse to the clean URL
 * (avoids index bloat); page 2+ keeps ?page=N so deeper products stay discoverable.
 */
export function listingCanonical(path: string, sp: { page?: string | string[] }) {
  const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Number(raw);
  return Number.isInteger(page) && page > 1 && page < 1000 ? `${path}?page=${page}` : path;
}
