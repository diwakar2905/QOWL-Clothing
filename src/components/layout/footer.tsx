import Link from "next/link";
import { Logo } from "@/components/ui/misc";
import type { Settings } from "@/server/services/settings";
import { NewsletterBand } from "@/components/store/newsletter";
import { FooterBag } from "./footer-bag";

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
  const help = pages.filter((p) => p.footerGroup === "help");
  const legal = pages.filter((p) => p.footerGroup === "legal");
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
            <FooterCol title="Shop" links={[{ href: "/new-in", label: "New In" }, { href: "/collections/drop-001", label: "Drop 001" }, ...categories.map((c) => ({ href: `/category/${c.slug}`, label: c.name })), { href: "/collections", label: "Collections" }, { href: "/lookbook", label: "Lookbook" }]} />
            <FooterCol title="Help" links={[{ href: "/orders/track", label: "Order tracking" }, ...help.map((p) => ({ href: `/pages/${p.slug}`, label: p.title })), { href: "/size-guide", label: "Size guide" }, { href: "/account/preferences", label: "Newsletter preferences" }]} />
            {social.length > 0 && <FooterCol title="Follow" links={social.map(([k, url]) => ({ href: url, label: labels[k] ?? k, external: true }))} />}
          </div>
          <div className="-my-6 hidden shrink-0 lg:block">
            <FooterBag />
          </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 border-t hairline px-4 py-5 text-[12px] text-charcoal/70 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <p>
            © {new Date().getFullYear()} {s.legalName || s.brandName}. All rights reserved.
            {s.gstin && <span className="ml-2">GSTIN {s.gstin}</span>}
          </p>
          <ul className="flex flex-wrap gap-5">
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
