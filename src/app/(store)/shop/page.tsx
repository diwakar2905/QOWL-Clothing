import type { Metadata } from "next";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";

export const metadata: Metadata = { title: "Shop all", description: "Shop all QOWL streetwear.", alternates: { canonical: "/shop" } };

export default async function ShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <ProductListing base={{}} searchParams={await searchParams} title="Shop All" crumbs={[{ label: "Home", href: "/" }, { label: "Shop" }]} path="/shop" categoryTabs />;
}
