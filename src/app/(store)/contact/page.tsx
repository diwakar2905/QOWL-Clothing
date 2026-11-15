import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/server/services/settings";
import { Breadcrumbs, Container } from "@/components/ui/misc";
import { Truck, RefreshCw, Ruler, Package } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Contact us", description: "Get help with orders, returns, sizing and anything else.", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const s = (await getSettings()).store;
  const quick = [
    { href: "/orders/track", label: "Track an order", body: "Order number and email or phone.", Icon: Truck },
    { href: "/pages/returns-and-exchanges", label: "Returns & exchanges", body: "How to start a return.", Icon: RefreshCw },
    { href: "/size-guide", label: "Size guide", body: "Find your fit before you order.", Icon: Ruler },
    { href: "/pages/shipping-policy", label: "Shipping", body: "Delivery times and charges.", Icon: Package },
  ];
  return (
    <Container className="max-w-4xl py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact us" }]} />
      <h1 className="display mt-8 text-5xl text-obsidian sm:text-6xl">Contact us</h1>
      <p className="mt-3 max-w-xl text-[15px] text-charcoal/80">Questions about an order, sizing or a return? We usually reply within one working day.</p>

      <section className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-charcoal/[0.07]">
          <h2 className="label text-stone">Customer care</h2>
          {s.supportEmail || s.supportPhone ? (
            <div className="mt-3 space-y-1.5 text-[15px]">
              {s.supportEmail && <p><a className="text-forest underline underline-offset-4" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></p>}
              {s.supportPhone && <p><a className="underline underline-offset-4" href={`tel:${s.supportPhone.replace(/\s/g, "")}`}>{s.supportPhone}</a></p>}
              {s.supportHours && <p className="text-sm text-stone">{s.supportHours}</p>}
            </div>
          ) : (
            <p className="mt-3 text-sm text-charcoal/75">Our support details are being set up. Meanwhile you can track your order or reply to your order confirmation email.</p>
          )}
        </div>
        <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-charcoal/[0.07]">
          <h2 className="label text-stone">Grievance Officer</h2>
          {s.grievanceOfficerName || s.grievanceOfficerEmail ? (
            <div className="mt-3 space-y-1 text-[15px]">
              {s.grievanceOfficerName && <p>{s.grievanceOfficerName}{s.grievanceOfficerDesignation && `, ${s.grievanceOfficerDesignation}`}</p>}
              {s.grievanceOfficerEmail && <p><a className="text-forest underline underline-offset-4" href={`mailto:${s.grievanceOfficerEmail}`}>{s.grievanceOfficerEmail}</a></p>}
              {s.grievanceOfficerPhone && <p>{s.grievanceOfficerPhone}</p>}
            </div>
          ) : (
            <p className="mt-3 text-sm text-charcoal/75">Details will be published here, as required under the Consumer Protection (E-Commerce) Rules, 2020.</p>
          )}
          {s.legalName && <p className="mt-3 text-xs text-stone">{s.legalName}{s.registeredAddress && ` — ${s.registeredAddress}`}</p>}
        </div>
      </section>

      <h2 className="label-wide mt-14 text-charcoal">Quick help</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {quick.map(({ href, label, body, Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-start gap-4 rounded-2xl bg-white/70 p-5 ring-1 ring-charcoal/[0.07] transition hover:ring-forest/40">
              <Icon className="mt-0.5 h-5 w-5 text-forest" strokeWidth={1.5} />
              <span><span className="block font-medium text-obsidian">{label}</span><span className="text-sm text-charcoal/70">{body}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
