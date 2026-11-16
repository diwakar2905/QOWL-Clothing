import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategory, listProducts } from "@/server/services/catalog";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";
import { listingCanonical, listingFacts, metaDescription } from "@/lib/seo";
import { Markdown } from "@/components/ui/markdown";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  if (!c) notFound();
  const { items, total } = await listProducts({ category: c.slug, perPage: 48 });
  const facts = listingFacts(total, items.map((i) => i.price));
  const description = c.seoDescription ?? metaDescription(`Shop ${c.name.toLowerCase()} by QOWL, independent Indian streetwear${facts ? `: ${facts}` : ""}. ${c.description ?? ""}`);
  return { title: c.seoTitle ?? c.name, description, alternates: { canonical: listingCanonical(`/category/${c.slug}`, await searchParams) }, openGraph: { title: `${c.seoTitle ?? c.name} | QOWL`, description } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const c = await getCategory((await params).slug);
  if (!c) notFound();
  return <ProductListing base={{ category: c.slug }} searchParams={await searchParams} eyebrow="QOWL" title={c.name} subtitle={c.description ?? undefined} crumbs={[{ label: "Home", href: "/" }, { label: c.name }]} path={`/category/${c.slug}`} after={<PageCopy title={c.name} content={c.content} />} />;
}

function PageCopy({ title, content }: { title: string; content: string | null }) {
  if (!content?.trim()) return null;
  return (
    <section aria-labelledby="page-copy" className="mx-auto mt-20 max-w-3xl border-t hairline pt-12">
      <h2 id="page-copy" className="display text-3xl text-obsidian sm:text-4xl">About {title}</h2>
      <div className="mt-6"><Markdown source={content} /></div>
    </section>
  );
}
