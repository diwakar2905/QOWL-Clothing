import Link from "next/link";
import { Logo } from "@/components/ui/misc";
import type { Settings } from "@/server/services/settings";
import { NewsletterBand } from "@/components/store/newsletter";
import { FooterBag } from "./footer-bag";
import { POLICIES } from "@/lib/policies";

type FooterProps = {
  settings: Settings;
  pages: { slug: string; title: string; footerGroup: string }[];
  categories: { slug: string; name: string }[];
  showNewsletter: boolean;
};

export function Footer({ settings, pages, categories, showNewsletter }: FooterProps) {
  const s = settings.store;
  const social = Object.entries(settings.social).filter(([, url]) => url) as [string, string][];
  const labels: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", pinterest: "Pinterest", x: "X", facebook: "Facebook" };
  // Standard policies are always linked (unpublished ones show a "being finalised" page);
  // any other published help/legal pages are added after them.
  const standard = new Set<string>(POLICIES.map((p) => p.slug));
  const help = [...POLICIES.filter((p) => p.group === "help"), ...pages.filter((p) => p.footerGroup === "help" && !standard.has(p.slug))];
  const legal = [...POLICIES.filter((p) => p.group === "legal"), ...pages.filter((p) => p.footerGroup === "legal" && !standard.has(p.slug))];
  const pay = ["UPI", "Cards", "Net banking", ...(settings.payments.codEnabled ? ["Cash on delivery"] : [])];
  return (
    <footer className="mt-auto">
      {showNewsletter && <NewsletterBand settings={settings.newsletter} />}
      <div className="bg-ivory">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_2fr] lg:px-10">
          <div className="flex items-start gap-6 md:border-r hairline md:pr-10">
            <Logo tone="forest" className="h-20 shrink-0" />
            <div className="text-[13px] leading-relaxed text-charcoal/85">
              <p>{s.description || "Independent streetwear"}</p>
              {s.establishedLine && <p className="mt-1">{s.establishedLine}</p>}
              <p className="mt-3 max-w-sm text-charcoal/70">Designed in India and released in small, numbered drops. Drop 001, <em className="font-serif text-[15px]">The Unwritten</em>, is out now.</p>
              <Link href="/our-story" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-forest hover:underline">Read our story →</Link>
              {(s.supportEmail || s.supportPhone) && (
                <div className="mt-4 space-y-0.5">
                  <p className="label text-stone">Customer care</p>
                  {s.supportEmail && <p><a className="link-underline" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></p>}
                  {s.supportPhone && <p><a className="link-underline" href={`tel:${s.supportPhone.replace(/\s/g, "")}`}>{s.supportPhone}</a></p>}
                  {s.supportHours && <p className="text-stone">{s.supportHours}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-8">
          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterCol title="Shop" links={[{ href: "/new-in", label: "New In" }, { href: "/collections/drop-001", label: "Drop 001" }, ...categories.map((c) => ({ href: `/category/${c.slug}`, label: c.name })), { href: "/collections", label: "Collections" }]} />
            <FooterCol title="Help" links={[{ href: "/orders/track", label: "Track your order" }, ...help.map((p) => ({ href: `/pages/${p.slug}`, label: p.title })), { href: "/size-guide", label: "Size guide" }, { href: "/contact", label: "Contact us" }]} />
            <FooterCol title="QOWL" links={[{ href: "/our-story", label: "Our story" }, { href: "/lookbook", label: "Lookbook" }, { href: "/account", label: "My account" }, { href: "/account/preferences", label: "Newsletter preferences" }, ...social.map(([k, url]) => ({ href: url, label: labels[k] ?? k, external: true }))]} />
          </div>
          <div className="-my-6 hidden shrink-0 lg:block">
            <FooterBag />
          </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 border-t hairline px-4 py-5 text-[12px] text-charcoal/70 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <p>
            © {new Date().getFullYear()} {s.legalName || s.brandName}. All rights reserved. <span className="whitespace-nowrap">Made in India.</span>
            {s.gstin && <span className="ml-2 whitespace-nowrap">GSTIN {s.gstin}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-1.5" aria-label="Payment methods">
            <span className="mr-1">We accept</span>
            {pay.map((m) => <span key={m} className="rounded-full bg-cream px-2.5 py-0.5 text-[11px] text-charcoal/80 ring-1 ring-charcoal/10">{m}</span>)}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {legal.map((p) => (
              <li key={p.slug}><Link href={`/pages/${p.slug}`} className="link-underline">{p.title}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string; external?: boolean }[] }) {
  return (
    <div>
      <h2 className="mb-3 font-sans text-[13px] font-semibold text-obsidian">{title}</h2>
      <ul className="space-y-1.5 text-[13px] text-charcoal/85">
        {links.map((l) => (
          <li key={l.href + l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="link-underline">{l.label}</a>
            ) : (
              <Link href={l.href} className="link-underline">{l.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
