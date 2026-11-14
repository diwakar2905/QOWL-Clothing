import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Card } from "@/components/admin/ui";
import { SectionsEditor, HeroSlides, Announcements, Lookbook, Pages } from "@/components/admin/content-client";

export const metadata = { title: "Homepage & content" };
const toLocal = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : "");

export default async function ContentAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("content.manage");
  const tab = (await searchParams).tab ?? "homepage";
  const tabs = [["homepage", "Homepage sections"], ["hero", "Hero slides"], ["announcements", "Announcements"], ["lookbook", "Lookbook"], ["pages", "Pages & policies"]];
  return (
    <>
      <PageHeader title="Homepage & content" description="Changes go live immediately. Only approved claims should be marked approved in the craft section." />
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">{tabs.map(([k, l]) => <a key={k} href={`/admin/content?tab=${k}`} className={`border px-3 py-1.5 ${tab === k ? "border-forest bg-forest text-ivory" : "hairline bg-ivory"}`}>{l}</a>)}</nav>
      {tab === "homepage" && <Card title="Sections (drag order with arrows)"><SectionsEditor sections={(await db.homepageSection.findMany({ orderBy: { sortOrder: "asc" } })).map((s) => ({ id: s.id, type: s.type, label: s.label, isVisible: s.isVisible, data: JSON.stringify(s.data, null, 2) }))} /></Card>}
      {tab === "hero" && <HeroSlides slides={(await db.heroSlide.findMany({ orderBy: { sortOrder: "asc" } })).map((s) => ({ ...s, startsAt: toLocal(s.startsAt), endsAt: toLocal(s.endsAt), createdAt: undefined, updatedAt: undefined }))} />}
      {tab === "announcements" && <Announcements items={(await db.announcement.findMany({ orderBy: { sortOrder: "asc" } })).map((a) => ({ id: a.id, message: a.message, href: a.href ?? "", isActive: a.isActive, startsAt: toLocal(a.startsAt), endsAt: toLocal(a.endsAt), sortOrder: a.sortOrder }))} />}
      {tab === "lookbook" && <Lookbook images={(await db.lookbookImage.findMany({ orderBy: { sortOrder: "asc" } })).map((l) => ({ id: l.id, imageUrl: l.imageUrl, alt: l.alt, caption: l.caption ?? "", productId: l.productId ?? "", isConcept: l.isConcept, sortOrder: l.sortOrder, isActive: l.isActive }))} products={await db.product.findMany({ select: { id: true, name: true } })} />}
      {tab === "pages" && <Pages pages={(await db.page.findMany({ orderBy: { sortOrder: "asc" } })).map((p) => ({ id: p.id, slug: p.slug, title: p.title, body: p.body, status: p.status, showInFooter: p.showInFooter, footerGroup: p.footerGroup, sortOrder: p.sortOrder, seoDescription: p.seoDescription ?? "" }))} />}
    </>
  );
}
