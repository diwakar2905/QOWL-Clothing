import "server-only";
import { db } from "@/lib/db";
import { getFeaturedCards, getProductCards, listProducts, type ProductCard } from "@/server/services/catalog";
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
    } else {
      out.push({ id: s.id, type, data: parseSectionData(type, s.data) as Record<string, unknown> });
    }
  }
  return out;
}
