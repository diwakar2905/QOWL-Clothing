import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCollection } from "@/server/services/catalog";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";
import { safeInternalPath } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCollection((await params).slug);
  if (!c) return {};
  return {
    title: c.seoTitle ?? c.title,
    description: c.seoDescription ?? c.description ?? undefined,
    alternates: { canonical: `/collections/${c.slug}` },
    openGraph: c.heroImageUrl ? { images: [c.heroImageUrl] } : undefined,
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const c = await getCollection((await params).slug);
  if (!c) notFound();
  if (c.linkType === "EDITORIAL" && c.editorialHref) redirect(safeInternalPath(c.editorialHref, "/lookbook"));
  return (
    <ProductListing
      base={{ collection: c.slug }}
      searchParams={await searchParams}
      eyebrow={c.eyebrow ?? "QOWL Collection"}
      title={c.title}
      subtitle={c.description ?? undefined}
      crumbs={[{ label: "Home", href: "/" }, { label: "Collections", href: "/collections" }, { label: c.title }]}
      path={`/collections/${c.slug}`}
      categoryTabs
    />
  );
}
