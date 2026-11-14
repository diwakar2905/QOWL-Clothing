import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategory } from "@/server/services/catalog";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  if (!c) return {};
  return { title: c.seoTitle ?? c.name, description: c.seoDescription ?? c.description ?? undefined, alternates: { canonical: `/category/${c.slug}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const c = await getCategory((await params).slug);
  if (!c) notFound();
  return <ProductListing base={{ category: c.slug }} searchParams={await searchParams} eyebrow="QOWL" title={c.name} subtitle={c.description ?? undefined} crumbs={[{ label: "Home", href: "/" }, { label: c.name }]} path={`/category/${c.slug}`} />;
}
