import { formatINR } from "@/lib/money";

/**
 * Customer FAQ built only from live Settings and catalogue facts. A question is
 * left out when the store hasn't configured the answer, so the page never
 * promises a delivery time, return window or payment option that isn't real.
 */
export type FaqItem = { q: string; a: string; link?: { href: string; label: string } };

export type FaqInput = {
  brandName: string;
  description: string;
  categories: string[];
  sizes: string[];
  pricePaise: { min: number; max: number } | null;
  sizeGuideApproved: boolean;
  googleSignIn: boolean;
  shipping: {
    flatRatePaise: number | null;
    freeShippingThresholdPaise: number | null;
    deliverAllIndia: boolean;
    estimateMinDays: number | null;
    estimateMaxDays: number | null;
    dispatchNote: string;
  };
  returns: { allowReturns: boolean; allowExchanges: boolean; windowDays: number | null; policySummary: string };
  payments: { onlineEnabled: boolean; codEnabled: boolean; codFeePaise: number; codMinOrderPaise: number | null; codMaxOrderPaise: number | null };
  support: { email: string; phone: string; hours: string };
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function storeFaq(f: FaqInput): FaqItem[] {
  const out: FaqItem[] = [];
  const brand = f.brandName || "QOWL";

  out.push({
    q: `What is ${brand}?`,
    a: [
      `${brand} is an independent Indian streetwear label.`,
      f.categories.length ? `We make ${list(f.categories.map((c) => (/^[A-Z]-/.test(c) ? c : c.toLowerCase())))} with original artwork, released in small numbered drops.` : null,
      f.description && !/^independent/i.test(f.description) ? f.description : null,
    ].filter(Boolean).join(" "),
    link: { href: "/our-story", label: "Read our story" },
  });

  if (f.pricePaise) {
    const { min, max } = f.pricePaise;
    out.push({
      q: `How much do ${brand} clothes cost?`,
      a: min === max ? `Pieces are ${formatINR(min)}, inclusive of GST.` : `Pieces range from ${formatINR(min)} to ${formatINR(max)}, inclusive of GST.`,
      link: { href: "/shop", label: "Shop all" },
    });
  }

  if (f.sizes.length) {
    out.push({
      q: "What sizes are available, and how do they fit?",
      a: `Current pieces come in ${f.sizes.length > 1 ? `sizes ${f.sizes[0]} to ${f.sizes.at(-1)}` : `size ${f.sizes[0]}`}. Each product page notes its fit, and our oversized cuts are meant to sit relaxed.`,
      ...(f.sizeGuideApproved ? { link: { href: "/size-guide", label: "See garment measurements" } } : {}),
    });
  }

  const s = f.shipping;
  if (s.flatRatePaise != null) {
    const where = s.deliverAllIndia ? "We ship across India." : "We ship to serviceable pin codes in India; checkout confirms yours.";
    const cost = s.flatRatePaise === 0
      ? "Shipping is free on every order."
      : `Shipping is ${formatINR(s.flatRatePaise)} per order${s.freeShippingThresholdPaise != null ? `, and free on orders of ${formatINR(s.freeShippingThresholdPaise)} or more` : ""}.`;
    out.push({ q: "Where do you ship, and how much does shipping cost?", a: `${where} ${cost}` });
  }

  if (s.estimateMinDays != null || s.estimateMaxDays != null) {
    const lo = s.estimateMinDays ?? s.estimateMaxDays!;
    const hi = s.estimateMaxDays ?? s.estimateMinDays!;
    out.push({
      q: "How long does delivery take?",
      a: [`Orders usually arrive in ${lo === hi ? lo : `${lo}–${hi}`} business days.`, s.dispatchNote || null].filter(Boolean).join(" "),
      link: { href: "/orders/track", label: "Track an order" },
    });
  }

  const r = f.returns;
  if (r.allowReturns && r.windowDays) {
    out.push({
      q: "Can I return or exchange an order?",
      a: [
        `Yes. You can request a return${r.allowExchanges ? " or exchange" : ""} within ${r.windowDays} days of delivery from your account.`,
        r.policySummary || null,
      ].filter(Boolean).join(" "),
      link: { href: "/pages/returns-and-exchanges", label: "Returns & exchanges policy" },
    });
  }

  const p = f.payments;
  const methods = [p.onlineEnabled ? "UPI, cards, net banking and wallets (secured by Razorpay)" : null, p.codEnabled ? "cash on delivery" : null].filter((m): m is string => !!m);
  if (methods.length) {
    const cod = p.codEnabled
      ? [
          p.codFeePaise > 0 ? `COD carries a ${formatINR(p.codFeePaise)} fee.` : null,
          p.codMinOrderPaise != null || p.codMaxOrderPaise != null
            ? `COD is available on orders ${p.codMinOrderPaise != null ? `from ${formatINR(p.codMinOrderPaise)}` : ""}${p.codMinOrderPaise != null && p.codMaxOrderPaise != null ? " " : ""}${p.codMaxOrderPaise != null ? `up to ${formatINR(p.codMaxOrderPaise)}` : ""}, for eligible pin codes.`
            : null,
        ].filter(Boolean).join(" ")
      : "";
    out.push({ q: "Which payment methods do you accept?", a: `We accept ${list(methods)}. ${cod}`.trim() });
  }

  out.push({
    q: "Do I need an account to order?",
    a: `You can browse the whole store without one. To check out, sign in${f.googleSignIn ? " with your email or Google" : ""} so you can track orders and request returns.`,
  });

  out.push({ q: "How do I track my order?", a: "Use the order tracker with your order number and email, or open the order from your account.", link: { href: "/orders/track", label: "Track your order" } });

  if (f.support.email || f.support.phone) {
    const ways = [f.support.email ? `email ${f.support.email}` : null, f.support.phone ? `call ${f.support.phone}` : null].filter(Boolean) as string[];
    out.push({ q: `How do I contact ${brand}?`, a: `${list(ways).replace(/^./, (c) => c.toUpperCase())}${f.support.hours ? ` (${f.support.hours})` : ""}.`, link: { href: "/contact", label: "Contact us" } });
  }

  return out;
}

export function faqPageLd(items: FaqItem[], url: string) {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    url,
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}
