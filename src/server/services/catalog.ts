import "server-only";
import { cache } from "react";
import { db, Prisma } from "@/lib/db";
import { isSaleActive, unitPrice } from "@/domain/pricing";
import { sizeRank } from "@/lib/utils";

/** A product is publicly visible when ACTIVE and its publish time has passed. */
export function visibleProductWhere(now = new Date()): Prisma.ProductWhereInput {
  return { status: "ACTIVE", OR: [{ publishAt: null }, { publishAt: { lte: now } }] };
}
export function visibleCollectionWhere(now = new Date()): Prisma.CollectionWhereInput {
  return { status: "ACTIVE", OR: [{ publishAt: null }, { publishAt: { lte: now } }] };
}

const cardInclude = {
  colors: { orderBy: { sortOrder: "asc" } },
  images: { orderBy: { sortOrder: "asc" }, take: 6 },
  variants: { where: { isActive: true }, include: { inventory: { select: { onHand: true, reserved: true } } } },
  category: { select: { name: true, slug: true } },
} satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

export type ProductCard = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  category: { name: string; slug: string };
  price: number;
  mrp: number;
  onSale: boolean;
  colors: { name: string; hex: string; slug: string }[];
  sizes: string[];
  primaryImage: { url: string; alt: string; isConcept: boolean } | null;
  secondaryImage: { url: string; alt: string; isConcept: boolean } | null;
  /** Up to 4 images for the card carousel (first = primary). */
  images: { url: string; alt: string }[];
  inStock: boolean;
  createdAt: Date;
};

export function toCard(p: CardRow, now = new Date()): ProductCard {
  const price = unitPrice(p, null, now);
  const imgs = p.images;
  const sizes = [...new Set(p.variants.map((v) => v.size))].sort((a, b) => sizeRank(a) - sizeRank(b));
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    subtitle: p.subtitle,
    category: p.category,
    price,
    mrp: p.mrp,
    onSale: isSaleActive(p, now) && price < p.price,
    colors: p.colors.map((c) => ({ name: c.name, hex: c.hex, slug: c.slug })),
    sizes,
    primaryImage: imgs[0] ? { url: imgs[0].url, alt: imgs[0].alt, isConcept: imgs[0].isConcept } : null,
    secondaryImage: imgs[1] ? { url: imgs[1].url, alt: imgs[1].alt, isConcept: imgs[1].isConcept } : null,
    images: imgs.slice(0, 4).map((i) => ({ url: i.url, alt: i.alt })),
    inStock: p.variants.some((v) => (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) > 0),
    createdAt: p.createdAt,
  };
}

export type ListingFilters = {
  category?: string;
  collection?: string;
  sizes?: string[];
  colors?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "popular" | "featured";
  page?: number;
  perPage?: number;
  newInDays?: number;
  q?: string;
};

export type ListingResult = {
  items: ProductCard[];
  total: number;
  page: number;
  pages: number;
  facets: { sizes: string[]; colors: { name: string; hex: string; slug: string }[]; priceRange: [number, number] };
  popularityAvailable: boolean;
};

async function collectionProductIds(slug: string): Promise<string[] | null> {
  const c = await db.collection.findFirst({ where: { slug, ...visibleCollectionWhere() }, include: { products: { orderBy: { sortOrder: "asc" } } } });
  if (!c) return null;
  if (c.type === "MANUAL") return c.products.map((p) => p.productId);
  const rules = (c.rules ?? {}) as { categorySlugs?: string[]; tags?: string[] };
  const rows = await db.product.findMany({
    where: {
      ...visibleProductWhere(),
      ...(rules.categorySlugs?.length ? { category: { slug: { in: rules.categorySlugs } } } : {}),
      ...(rules.tags?.length ? { tags: { hasSome: rules.tags } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Catalogue listing. The DROP 001 catalogue is small, so filtering by computed
 * effective price/availability happens in memory after a visibility-scoped
 * query; database-level pagination should replace this once the catalogue
 * grows beyond a few hundred products.
 */
export async function listProducts(f: ListingFilters): Promise<ListingResult> {
  const now = new Date();
  const where: Prisma.ProductWhereInput = { ...visibleProductWhere(now) };
  let manualOrder: string[] | null = null;
  if (f.category) where.category = { slug: f.category };
  if (f.collection) {
    const ids = await collectionProductIds(f.collection);
    manualOrder = ids ?? [];
    where.id = { in: manualOrder };
  }
  if (f.newInDays) where.OR = [{ publishedAt: { gte: new Date(now.getTime() - f.newInDays * 86400_000) } }, { createdAt: { gte: new Date(now.getTime() - f.newInDays * 86400_000) } }];
  if (f.q) {
    const ids = await searchProductIds(f.q);
    where.id = manualOrder ? { in: manualOrder.filter((id) => ids.includes(id)) } : { in: ids };
    manualOrder = ids;
  }
  const rows = await db.product.findMany({ where, include: cardInclude, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  const all = rows.map((r) => toCard(r, now));

  const facetSizes = [...new Set(all.flatMap((c) => c.sizes))].sort((a, b) => sizeRank(a) - sizeRank(b));
  const facetColors = new Map<string, { name: string; hex: string; slug: string }>();
  all.forEach((c) => c.colors.forEach((col) => facetColors.set(col.slug, col)));
  const prices = all.map((c) => c.price);

  let items = all.filter((c) => {
    if (f.sizes?.length && !c.sizes.some((s) => f.sizes!.includes(s))) return false;
    if (f.colors?.length && !c.colors.some((col) => f.colors!.includes(col.slug))) return false;
    if (f.minPrice != null && c.price < f.minPrice) return false;
    if (f.maxPrice != null && c.price > f.maxPrice) return false;
    if (f.inStock && !c.inStock) return false;
    return true;
  });

  // Popularity is only offered when genuine paid-order data exists.
  const sales = await unitsSoldByProduct(items.map((i) => i.id));
  const popularityAvailable = [...sales.values()].some((v) => v > 0);
  const sort = f.sort ?? (manualOrder ? "featured" : "newest");
  if (sort === "price_asc") items.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") items.sort((a, b) => b.price - a.price);
  else if (sort === "popular" && popularityAvailable) items.sort((a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0));
  else if (sort === "featured" && manualOrder) items.sort((a, b) => manualOrder!.indexOf(a.id) - manualOrder!.indexOf(b.id));
  else if (sort === "newest") items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const perPage = Math.min(Math.max(f.perPage ?? 24, 1), 60);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(f.page ?? 1, 1), pages);
  items = items.slice((page - 1) * perPage, page * perPage);
  return {
    items,
    total,
    page,
    pages,
    facets: { sizes: facetSizes, colors: [...facetColors.values()], priceRange: [prices.length ? Math.min(...prices) : 0, prices.length ? Math.max(...prices) : 0] },
    popularityAvailable,
  };
}

async function unitsSoldByProduct(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { in: ids }, order: { paymentStatus: { in: ["PAID", "COD_COLLECTED", "PARTIALLY_REFUNDED"] } } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId!, r._sum.quantity ?? 0]));
}

export async function getProductCards(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, ...visibleProductWhere() }, include: cardInclude });
  const cards = rows.map((r) => toCard(r));
  return ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is ProductCard => !!c);
}

export async function getFeaturedCards(limit = 6): Promise<ProductCard[]> {
  const rows = await db.product.findMany({ where: visibleProductWhere(), include: cardInclude, orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], take: limit });
  return rows.map((r) => toCard(r));
}

/** Full product detail. Preview mode lets staff view unpublished products. */
export const getProductDetail = cache(async (slug: string, opts: { preview?: boolean } = {}) => {
  const p = await db.product.findFirst({
    where: { slug, ...(opts.preview ? {} : visibleProductWhere()) },
    include: {
      category: true,
      taxClass: true,
      sizeGuide: true,
      colors: { orderBy: { sortOrder: "asc" } },
      images: { orderBy: { sortOrder: "asc" } },
      variants: { where: { isActive: true }, include: { inventory: true } },
      collections: { include: { collection: { select: { slug: true, title: true, status: true, publishAt: true } } } },
      reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { name: true } }, media: true } },
    },
  });
  if (!p) return null;
  const now = new Date();
  const price = unitPrice(p, null, now);
  const variants = p.variants
    .map((v) => ({
      id: v.id,
      colorId: v.colorId,
      size: v.size,
      sku: v.sku,
      price: unitPrice(p, v, now),
      available: Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)),
      sizeRank: v.sizeRank || sizeRank(v.size),
    }))
    .sort((a, b) => a.sizeRank - b.sizeRank);
  const ratingAgg = await db.review.aggregate({ where: { productId: p.id, status: "APPROVED" }, _avg: { rating: true }, _count: true });
  const visibleCollections = p.collections
    .map((c) => c.collection)
    .filter((c) => c.status === "ACTIVE" && (!c.publishAt || c.publishAt <= now));
  return {
    ...p,
    effectivePrice: price,
    onSale: isSaleActive(p, now) && price < p.price,
    variants,
    visibleCollections,
    rating: ratingAgg._count ? { average: Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10, count: ratingAgg._count } : null,
  };
});
export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

export async function relatedProducts(productId: string, categoryId: string, limit = 3): Promise<ProductCard[]> {
  const rows = await db.product.findMany({
    where: { ...visibleProductWhere(), id: { not: productId } },
    include: cardInclude,
    orderBy: [{ sortOrder: "asc" }],
  });
  // Prefer other categories for "complete the look", then same category.
  const sorted = rows.sort((a, b) => Number(a.categoryId === categoryId) - Number(b.categoryId === categoryId));
  return sorted.slice(0, limit).map((r) => toCard(r));
}

export async function collectionSiblings(collectionSlug: string, productId: string, limit = 6): Promise<ProductCard[]> {
  const ids = (await collectionProductIds(collectionSlug)) ?? [];
  return (await getProductCards(ids.filter((id) => id !== productId))).slice(0, limit);
}

export const listCollections = cache(async (opts: { explore?: boolean } = {}) => {
  return db.collection.findMany({ where: { ...visibleCollectionWhere(), ...(opts.explore ? { showInExplore: true } : {}) }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
});

export const getCollection = cache(async (slug: string) => db.collection.findFirst({ where: { slug, ...visibleCollectionWhere() } }));

export const listCategories = cache(async () => db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }));
export const getCategory = cache(async (slug: string) => db.category.findFirst({ where: { slug, isActive: true } }));

// ──────────────────────────────── Search ────────────────────────────────

/** Postgres search: substring + trigram similarity for typo tolerance. */
export async function searchProductIds(qRaw: string, limit = 48): Promise<string[]> {
  const q = qRaw.trim().toLowerCase().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM "Product" p
    WHERE p.status = 'ACTIVE' AND (p."publishAt" IS NULL OR p."publishAt" <= now())
      AND (p."searchText" ILIKE ${like} OR word_similarity(${q}, p."searchText") > 0.35)
    ORDER BY (p."searchText" ILIKE ${like}) DESC, word_similarity(${q}, p."searchText") DESC
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export async function searchSuggestions(qRaw: string): Promise<{ products: { name: string; slug: string }[]; suggestion: string | null }> {
  const ids = await searchProductIds(qRaw, 6);
  const products = ids.length ? await db.product.findMany({ where: { id: { in: ids } }, select: { name: true, slug: true, id: true } }) : [];
  let suggestion: string | null = null;
  if (!products.length && qRaw.trim().length >= 3) {
    const rows = await db.$queryRaw<{ name: string }[]>`
      SELECT name FROM "Product" WHERE status = 'ACTIVE' ORDER BY similarity(lower(name), ${qRaw.trim().toLowerCase()}) DESC LIMIT 1`;
    suggestion = rows[0]?.name ?? null;
  }
  return { products: ids.map((id) => products.find((p) => p.id === id)!).filter(Boolean).map(({ name, slug }) => ({ name, slug })), suggestion };
}

/** Privacy-safe analytics: the query text and count only, no user/IP. */
export async function logSearch(q: string, resultCount: number) {
  const query = q.trim().toLowerCase().slice(0, 80);
  if (query.length < 2) return;
  await db.searchQueryLog.create({ data: { query, resultCount } }).catch(() => {});
}

export function buildSearchText(p: { name: string; styleCode: string; subtitle?: string | null; description: string; tags: string[]; categoryName: string; colors: string[]; skus: string[]; collections: string[] }) {
  return [p.name, p.styleCode, p.subtitle, p.categoryName, ...p.colors, ...p.tags, ...p.collections, ...p.skus, p.description.slice(0, 400)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
