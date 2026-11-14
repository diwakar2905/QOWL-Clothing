import type { Metadata } from "next";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";
import { logSearch, searchProductIds } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 80) ?? "";
  if (q && !sp.page) await logSearch(q, (await searchProductIds(q)).length);
  return (
    <ProductListing
      base={{ q: q || "__none__" }}
      searchParams={sp}
      eyebrow="Search"
      title={q ? `“${q}”` : "Search"}
      crumbs={[{ label: "Home", href: "/" }, { label: "Search" }]}
      path="/search"
      extraEmpty={q ? "Try a product name like Origin, a colour, or a category like hoodies." : "Enter a search term to find products."}
    />
  );
}
