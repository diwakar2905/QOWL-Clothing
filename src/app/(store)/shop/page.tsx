import type { Metadata } from "next";
import { listingCanonical } from "@/lib/seo";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  return { title: "Shop all", description: "Shop all QOWL streetwear: oversized T-shirts and hoodies from Drop 001.", alternates: { canonical: listingCanonical("/shop", await searchParams) } };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <ProductListing base={{}} searchParams={await searchParams} title="Shop All" crumbs={[{ label: "Home", href: "/" }, { label: "Shop" }]} path="/shop" categoryTabs />;
}
