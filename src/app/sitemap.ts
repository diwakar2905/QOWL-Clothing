import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { visibleCollectionWhere, visibleProductWhere } from "@/server/services/catalog";
import { absoluteUrl, siteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const latest = (...dates: (Date | null | undefined)[]) => dates.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];

/**
 * Only canonical, indexable, public URLs. Private/transactional pages, internal
 * search, filter/sort variants, drafts and "coming soon" pages are left out.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [products, collections, categories, pages, approvedGuides, lookbook] = await Promise.all([
    db.product.findMany({
      where: visibleProductWhere(),
      select: { slug: true, updatedAt: true, categoryId: true, images: { orderBy: { sortOrder: "asc" }, take: 6, select: { url: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    db.collection.findMany({ where: { ...visibleCollectionWhere(), linkType: "PRODUCTS" }, select: { slug: true, updatedAt: true } }),
    db.category.findMany({ where: { isActive: true }, select: { id: true, slug: true, updatedAt: true } }),
    db.page.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true } }),
    db.sizeGuide.findMany({ where: { isApproved: true }, select: { updatedAt: true } }),
    db.lookbookImage.findMany({ where: { isActive: true }, select: { createdAt: true } }),
  ]);
  const catalogUpdated = latest(...products.map((p) => p.updatedAt), ...collections.map((c) => c.updatedAt));
  const withProducts = new Set(products.map((p) => p.categoryId));

  return [
    { url: `${base}/`, lastModified: catalogUpdated, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, lastModified: catalogUpdated, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/new-in`, lastModified: catalogUpdated, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/collections`, lastModified: latest(...collections.map((c) => c.updatedAt)), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/our-story`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.3 },
    ...(approvedGuides.length ? [{ url: `${base}/size-guide`, lastModified: latest(...approvedGuides.map((g) => g.updatedAt)), changeFrequency: "monthly" as const, priority: 0.4 }] : []),
    ...(lookbook.length ? [{ url: `${base}/lookbook`, lastModified: latest(...lookbook.map((l) => l.createdAt)), changeFrequency: "monthly" as const, priority: 0.5 }] : []),
    ...products.map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.9,
      images: p.images.map((i) => absoluteUrl(i.url)),
    })),
    ...collections.map((c) => ({ url: `${base}/collections/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...categories.filter((c) => withProducts.has(c.id)).map((c) => ({ url: `${base}/category/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...pages.map((p) => ({ url: `${base}/pages/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
