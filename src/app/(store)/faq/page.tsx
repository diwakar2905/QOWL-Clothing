import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, Container, JsonLd } from "@/components/ui/misc";
import { getStoreFaq } from "@/server/faq";
import { faqPageLd } from "@/lib/faq";
import { absoluteUrl, graph } from "@/lib/seo";

export const metadata: Metadata = {
  title: "FAQ: Shipping, Returns, Sizes & Payments",
  description: "Answers about QOWL streetwear: prices, sizes and fit, shipping across India, delivery times, returns and exchanges, payment options and order tracking.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const items = await getStoreFaq();
  return (
    <Container className="max-w-3xl py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "FAQ" }]} />
      <header className="mt-8">
        <p className="label-wide text-forest">Help</p>
        <h1 className="display mt-3 text-5xl text-obsidian sm:text-6xl">Questions, answered</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-charcoal/80">Everything about ordering from QOWL, taken straight from how the store is set up today.</p>
      </header>
      <div className="mt-10 divide-y divide-charcoal/10 border-y border-charcoal/10">
        {items.map((item, i) => (
          <details key={item.q} className="group py-1" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left [&::-webkit-details-marker]:hidden">
              <h2 className="font-serif text-xl leading-snug text-obsidian sm:text-2xl">{item.q}</h2>
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ring-charcoal/15 text-forest transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="pb-6 pr-12 text-[15px] leading-relaxed text-charcoal/85">
              <p>{item.a}</p>
              {item.link && <Link href={item.link.href} className="mt-3 inline-block text-sm font-medium text-forest underline underline-offset-4 hover:text-obsidian">{item.link.label} →</Link>}
            </div>
          </details>
        ))}
      </div>
      <p className="mt-10 text-sm text-charcoal/75">Still have a question? <Link href="/contact" className="font-medium text-forest underline underline-offset-4">Get in touch</Link>.</p>
      <JsonLd data={graph(faqPageLd(items, absoluteUrl("/faq")))} />
    </Container>
  );
}
