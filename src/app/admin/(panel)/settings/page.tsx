import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { PageHeader, Card } from "@/components/admin/ui";
import { SettingsGroup, TaxClassForm, TemplateForm, SizeGuideForm, type FieldSpec } from "@/components/admin/settings-client";

export const metadata = { title: "Settings" };

const GROUPS: Record<string, { title: string; fields: FieldSpec[] }> = {
  store: { title: "Business & contact", fields: [
    { name: "brandName", label: "Brand name", type: "text" }, { name: "legalName", label: "Legal entity name", type: "text", hint: "As registered. Shown on invoices." },
    { name: "gstin", label: "GSTIN", type: "text" }, { name: "sellerState", label: "Seller state (for CGST/SGST vs IGST)", type: "state" },
    { name: "registeredAddress", label: "Registered address", type: "textarea" }, { name: "establishedLine", label: "Footer line (e.g. Est. 2026 — India)", type: "text" },
    { name: "tagline", label: "Tagline", type: "text" }, { name: "description", label: "Short description", type: "text" },
    { name: "supportEmail", label: "Customer care email", type: "text" }, { name: "supportPhone", label: "Customer care phone", type: "text" }, { name: "supportHours", label: "Support hours", type: "text" },
    { name: "grievanceOfficerName", label: "Grievance officer name", type: "text" }, { name: "grievanceOfficerDesignation", label: "Designation", type: "text" },
    { name: "grievanceOfficerEmail", label: "Grievance officer email", type: "text" }, { name: "grievanceOfficerPhone", label: "Grievance officer phone", type: "text" },
  ] },
  social: { title: "Social links", fields: ["instagram", "youtube", "pinterest", "x", "facebook"].map((n) => ({ name: n, label: n[0]!.toUpperCase() + n.slice(1), type: "text" as const, hint: "Full https:// URL; blank hides it." })) },
  shipping: { title: "Shipping", fields: [
    { name: "flatRatePaise", label: "Flat shipping rate (₹)", type: "money", hint: "Blank = not configured; checkout stays disabled." },
    { name: "freeShippingThresholdPaise", label: "Free shipping above (₹)", type: "money", hint: "Blank = no free shipping." },
    { name: "deliverAllIndia", label: "Deliver to all valid Indian PIN codes", type: "bool" },
    { name: "serviceablePincodePrefixes", label: "Serviceable PIN prefixes (if not all India)", type: "list" },
    { name: "blockedPincodes", label: "Blocked PIN codes", type: "list" },
    { name: "estimateMinDays", label: "Delivery estimate min days (blank = don't show)", type: "int" }, { name: "estimateMaxDays", label: "Delivery estimate max days", type: "int" },
    { name: "defaultWeightGrams", label: "Default parcel weight per unit (g)", type: "int" }, { name: "dispatchNote", label: "Dispatch note", type: "text" },
  ] },
  payments: { title: "Payments & COD", fields: [
    { name: "onlineEnabled", label: "Online payments (Razorpay) enabled", type: "bool" }, { name: "codEnabled", label: "Cash on Delivery enabled", type: "bool" },
    { name: "codMinOrderPaise", label: "COD minimum order (₹)", type: "money" }, { name: "codMaxOrderPaise", label: "COD maximum order (₹)", type: "money" },
    { name: "codFeePaise", label: "COD fee (₹, disclosed at checkout)", type: "money" }, { name: "codMaxOpenOrdersPerPhone", label: "Max open COD orders per phone", type: "int" },
    { name: "codPincodePrefixes", label: "COD allowed PIN prefixes (blank = all serviceable)", type: "list" }, { name: "codBlockedPincodes", label: "COD blocked PIN codes", type: "list" },
  ] },
  returns: { title: "Returns & exchanges", fields: [
    { name: "allowReturns", label: "Accept returns", type: "bool" }, { name: "allowExchanges", label: "Accept exchanges", type: "bool" },
    { name: "windowDays", label: "Request window (days after delivery)", type: "int" }, { name: "requirePhotos", label: "Require photos", type: "bool" },
    { name: "reasons", label: "Reasons offered", type: "list" }, { name: "policySummary", label: "Policy summary (shown on product & checkout)", type: "textarea" },
  ] },
  tax: { title: "Tax & invoices", fields: [
    { name: "invoicePrefix", label: "Invoice prefix", type: "text" }, { name: "shippingTaxMode", label: "GST on shipping/COD charges", type: "select", options: ["HIGHEST_LINE_RATE", "NONE"] },
    { name: "invoiceFooter", label: "Invoice footer", type: "textarea" }, { name: "reviewedByAdvisor", label: "Tax configuration reviewed by a tax advisor", type: "bool" },
  ] },
  seo: { title: "SEO defaults", fields: [{ name: "defaultTitle", label: "Default title", type: "text" }, { name: "titleTemplate", label: "Title template (%s)", type: "text" }, { name: "defaultDescription", label: "Default description", type: "textarea" }, { name: "ogImageUrl", label: "Social share image URL", type: "text" }] },
  newsletter: { title: "Newsletter copy", fields: [{ name: "heading", label: "Heading", type: "text" }, { name: "subheading", label: "Subheading", type: "text" }, { name: "consentText", label: "Consent text (recorded with each signup)", type: "textarea" }, { name: "doubleOptIn", label: "Require email confirmation", type: "bool" }] },
  launch: { title: "Imagery disclosure", fields: [{ name: "conceptImageNotice", label: "Concept image notice on product pages", type: "text" }] },
};

export default async function SettingsAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("settings.manage");
  const tab = (await searchParams).tab ?? "store";
  const settings = await getSettings();
  const tabs = [...Object.entries(GROUPS).map(([k, g]) => [k, g.title]), ["taxclasses", "Tax classes"], ["sizeguides", "Size guides"], ["emails", "Email templates"]];
  return (
    <>
      <PageHeader title="Settings" description="Leave business facts blank until confirmed — the storefront hides unset details rather than inventing them." />
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">{tabs.map(([k, l]) => <a key={k} href={`/admin/settings?tab=${k}`} className={`border px-3 py-1.5 ${tab === k ? "border-forest bg-forest text-ivory" : "hairline bg-ivory"}`}>{l}</a>)}</nav>
      {GROUPS[tab] && <Card title={GROUPS[tab].title}><SettingsGroup key={tab} group={tab} fields={GROUPS[tab].fields} values={settings[tab as keyof typeof settings] as Record<string, unknown>} /></Card>}
      {tab === "taxclasses" && <div className="space-y-4">{(await db.taxClass.findMany()).map((t) => <Card key={t.id} title={t.name}><TaxClassForm t={t} /></Card>)}<Card title="New tax class"><TaxClassForm /></Card></div>}
      {tab === "sizeguides" && <div className="space-y-4">{(await db.sizeGuide.findMany()).map((g) => <Card key={g.id} title={g.name}><SizeGuideForm g={{ ...g, rows: g.rows as Record<string, string | number>[] }} /></Card>)}<Card title="New size guide"><SizeGuideForm /></Card></div>}
      {tab === "emails" && <div className="space-y-4">{(await db.emailTemplate.findMany({ orderBy: { key: "asc" } })).map((t) => <Card key={t.key} title={t.name}><TemplateForm t={t} /></Card>)}</div>}
    </>
  );
}
