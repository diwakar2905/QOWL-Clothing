import type { Metadata } from "next";
import { listingCanonical } from "@/lib/seo";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  return { title: "New In", description: "The latest QOWL releases.", alternates: { canonical: listingCanonical("/new-in", await searchParams) } };
}

export default async function NewInPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <ProductListing
      base={{ newInDays: 45, sort: "newest" }}
      searchParams={await searchParams}
      eyebrow="Latest releases"
      title="New In"
      subtitle="Pieces released in the last 45 days."
      crumbs={[{ label: "Home", href: "/" }, { label: "New In" }]}
      path="/new-in"
      extraEmpty="Nothing new in the last few weeks — explore the full collection."
    />
  );
}
