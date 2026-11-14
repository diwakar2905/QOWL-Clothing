import type { Metadata } from "next";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";

export const metadata: Metadata = { title: "New In", description: "The latest QOWL releases.", alternates: { canonical: "/new-in" } };

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
