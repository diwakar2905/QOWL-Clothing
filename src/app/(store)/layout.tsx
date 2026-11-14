import { db } from "@/lib/db";
import { getSettings } from "@/server/services/settings";
import { getCurrentUser } from "@/server/auth/session";
import { getCartCount } from "@/server/services/cart";
import { listCategories } from "@/server/services/catalog";
import { activeAnnouncements } from "@/server/cms/homepage";
import { StoreProvider } from "@/components/providers/store";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AnnouncementBar } from "@/components/layout/announcement-bar";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, user, count, categories, announcements, pages] = await Promise.all([
    getSettings(),
    getCurrentUser(),
    getCartCount(),
    listCategories(),
    activeAnnouncements(),
    db.page.findMany({ where: { status: "ACTIVE", showInFooter: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, title: true, footerGroup: true } }),
  ]);
  const catLinks = categories.map((c) => ({ label: c.name, href: `/category/${c.slug}` }));
  const links = [{ label: "New In", href: "/new-in" }, { label: "Drop 001", href: "/collections/drop-001" }, ...catLinks, { label: "Collections", href: "/collections" }, { label: "Lookbook", href: "/lookbook" }];
  return (
    <StoreProvider user={user ? { name: user.name, email: user.email, isStaff: user.isStaff } : null} initialCount={count}>
      <AnnouncementBar items={announcements} />
      <Header links={links} secondary={pages.filter((p) => p.footerGroup === "help").map((p) => ({ label: p.title, href: `/pages/${p.slug}` }))} />
      <main id="main" className="flex-1">{children}</main>
      <Footer settings={settings} pages={pages} categories={categories} showNewsletter />
    </StoreProvider>
  );
}
