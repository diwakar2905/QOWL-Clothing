import "server-only";
import { db } from "@/lib/db";
import { getFeaturedCards, getProductCards, listProducts, visibleCollectionWhere, type ProductCard } from "@/server/services/catalog";
import { parseSectionData, type SectionType } from "./sections";

export async function activeAnnouncements() {
  const now = new Date();
  return db.announcement.findMany({
    where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
    orderBy: { sortOrder: "asc" },
  });
}

export async function activeHeroSlides() {
  const now = new Date();
  return db.heroSlide.findMany({
    where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
    orderBy: { sortOrder: "asc" },
  });
}

export type ResolvedSection =
  | { id: string; type: "HERO"; data: ReturnType<typeof parseSectionData<"HERO">>; slides: Awaited<ReturnType<typeof activeHeroSlides>> }
  | { id: string; type: "PRODUCT_GRID"; data: ReturnType<typeof parseSectionData<"PRODUCT_GRID">>; products: ProductCard[] }
  | { id: string; type: "LOOKBOOK"; data: ReturnType<typeof parseSectionData<"LOOKBOOK">>; images: { id: string; imageUrl: string; alt: string; caption: string | null; isConcept: boolean }[] }
  | { id: string; type: Exclude<SectionType, "HERO" | "PRODUCT_GRID" | "LOOKBOOK">; data: Record<string, unknown> };

export async function resolveHomepage(): Promise<ResolvedSection[]> {
  const sections = await db.homepageSection.findMany({ where: { isVisible: true }, orderBy: { sortOrder: "asc" } });
  const out: ResolvedSection[] = [];
  for (const s of sections) {
    const type = s.type as SectionType;
    if (type === "HERO") {
      const slides = await activeHeroSlides();
      if (slides.length) out.push({ id: s.id, type, data: parseSectionData("HERO", s.data), slides });
    } else if (type === "PRODUCT_GRID") {
      const data = parseSectionData("PRODUCT_GRID", s.data);
      let products: ProductCard[];
      if (data.mode === "manual") products = await getProductCards(data.productIds);
      else if (data.mode === "collection" && data.collectionSlug) products = (await listProducts({ collection: data.collectionSlug, perPage: data.limit })).items;
      else products = await getFeaturedCards(data.limit);
      if (products.length) out.push({ id: s.id, type, data, products: products.slice(0, data.limit) });
    } else if (type === "LOOKBOOK") {
      const data = parseSectionData("LOOKBOOK", s.data);
      const images = await db.lookbookImage.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: data.limit });
      if (images.length) out.push({ id: s.id, type, data, images });
    } else if (type === "CATEGORY_TILES") {
      const data = parseSectionData("CATEGORY_TILES", s.data);
      out.push({ id: s.id, type, data: { ...data, tiles: await Promise.all(data.tiles.map(async (t) => ({ ...t, href: await liveHref(t.href) }))) } });
    } else {
      out.push({ id: s.id, type, data: parseSectionData(type, s.data) as Record<string, unknown> });
    }
  }
  return out;
}

/**
 * Homepage tiles must never lead to a 404. If a tile points at a collection
 * that isn't published (draft, archived, scheduled or deleted), link to the
 * category a rule-based collection is built from, or to Shop All.
 */
async function liveHref(href: string): Promise<string> {
  const m = /^\/collections\/([a-z0-9-]+)\/?$/.exec(href);
  if (!m) return href;
  const c = await db.collection.findUnique({ where: { slug: m[1] }, select: { id: true, type: true, rules: true } });
  if (c && (await db.collection.count({ where: { id: c.id, ...visibleCollectionWhere() } }))) return href;
  const cats = c?.type === "RULE" ? ((c.rules as { categorySlugs?: string[] } | null)?.categorySlugs ?? []) : [];
  if (cats.length === 1 && (await db.category.count({ where: { slug: cats[0], isActive: true } }))) return `/category/${cats[0]}`;
  return "/shop";
}
