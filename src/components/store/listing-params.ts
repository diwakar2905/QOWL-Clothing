import type { ListingFilters } from "@/server/services/catalog";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = (v: string | string[] | undefined) =>
  (one(v) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 40)
    .slice(0, 12);

/** Parse untrusted listing query params into validated filters. */
export function parseListingParams(sp: SearchParams): ListingFilters {
  const sort = one(sp.sort);
  const n = (v: string | undefined) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 && x < 1_000_000 ? Math.round(x * 100) : undefined;
  };
  const page = Number(one(sp.page));
  return {
    sizes: list(sp.size),
    colors: list(sp.color),
    minPrice: n(one(sp.min)),
    maxPrice: n(one(sp.max)),
    inStock: one(sp.stock) === "1",
    sort: (["newest", "price_asc", "price_desc", "popular", "featured"] as const).find((s) => s === sort),
    page: Number.isInteger(page) && page > 0 && page < 1000 ? page : 1,
    category: one(sp.category)?.slice(0, 80),
  };
}
