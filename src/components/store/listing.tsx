import Link from "next/link";
import type { ReactNode } from "react";
import { listProducts, type ListingFilters } from "@/server/services/catalog";
import { Breadcrumbs, Container, EmptyState, SectionHeading } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import { ListingToolbar } from "./filters";
import { parseListingParams, type SearchParams } from "./listing-params";
import { cn } from "@/lib/utils";

export async function ProductListing({
  base,
  searchParams,
  title,
  eyebrow,
  subtitle,
  crumbs,
  path,
  categoryTabs,
  extraEmpty,
}: {
  base: ListingFilters;
  searchParams: SearchParams;
  title: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  crumbs: { label: string; href?: string }[];
  path: string;
  categoryTabs?: boolean;
  extraEmpty?: ReactNode;
}) {
  const parsed = parseListingParams(searchParams);
  const filters: ListingFilters = { ...base, ...parsed, category: parsed.category || base.category, perPage: 24 };
  const [result, unfiltered] = await Promise.all([listProducts(filters), categoryTabs ? listProducts({ ...base, perPage: 60 }) : Promise.resolve(null)]);
  let tabs: { label: string; value: string; count: number }[] | undefined;
  if (unfiltered) {
    const byCat = new Map<string, { label: string; count: number }>();
    for (const p of unfiltered.items) {
      const c = byCat.get(p.category.slug) ?? { label: p.category.name, count: 0 };
      c.count++;
      byCat.set(p.category.slug, c);
    }
    tabs = [{ label: "All", value: "", count: unfiltered.total }, ...[...byCat.entries()].map(([value, v]) => ({ value, label: v.label, count: v.count }))];
  }
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") p.set(k, v);
    if (page > 1) p.set("page", String(page));
    return `${path}${p.size ? `?${p}` : ""}`;
  };
  const hasFilters = !!(parsed.sizes?.length || parsed.colors?.length || parsed.minPrice || parsed.maxPrice || parsed.inStock || parsed.category);

  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={crumbs} />
      <SectionHeading as="h1" eyebrow={eyebrow} title={title} subtitle={subtitle} className="mb-8 mt-6 sm:mb-10" />
      <ListingToolbar facets={result.facets} total={result.total} popularityAvailable={result.popularityAvailable} categoryTabs={tabs} />
      {result.items.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No matches" : "Nothing here yet"}
          body={hasFilters ? "No products match these filters. Try removing a filter." : extraEmpty ?? "New pieces are on the way. Join the list to hear first."}
          action={hasFilters ? <ButtonLink href={path} variant="outline">Clear filters</ButtonLink> : <ButtonLink href="/collections">Explore collections</ButtonLink>}
        />
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4">
            {result.items.map((p, i) => (
              <li key={p.id}><ProductCard product={p} priority={i < 4} /></li>
            ))}
          </ul>
          {result.pages > 1 && (
            <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-2">
              {Array.from({ length: result.pages }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={qs(n)} aria-current={n === result.page ? "page" : undefined} className={cn("flex h-10 w-10 items-center justify-center border text-sm", n === result.page ? "border-forest bg-forest text-ivory" : "hairline hover:border-forest")}>
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
    </Container>
  );
}
