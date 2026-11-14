import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { visibleCollectionWhere, visibleProductWhere } from "@/server/services/catalog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const [products, collections, categories, pages] = await Promise.all([
    db.product.findMany({ where: visibleProductWhere(), select: { slug: true, updatedAt: true } }),
    db.collection.findMany({ where: { ...visibleCollectionWhere(), linkType: "PRODUCTS" }, select: { slug: true, updatedAt: true } }),
    db.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    db.page.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/new-in`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/collections`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/lookbook`, changeFrequency: "weekly", priority: 0.5 },
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updatedAt, priority: 0.9 })),
    ...collections.map((c) => ({ url: `${base}/collections/${c.slug}`, lastModified: c.updatedAt, priority: 0.7 })),
    ...categories.map((c) => ({ url: `${base}/category/${c.slug}`, lastModified: c.updatedAt, priority: 0.7 })),
    ...pages.map((p) => ({ url: `${base}/pages/${p.slug}`, lastModified: p.updatedAt, priority: 0.3 })),
  ];
}
