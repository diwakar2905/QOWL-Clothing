import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCollection, listProducts } from "@/server/services/catalog";
import { ProductListing } from "@/components/store/listing";
import type { SearchParams } from "@/components/store/listing-params";
import { safeInternalPath } from "@/lib/utils";
import { listingCanonical, listingFacts, metaDescription } from "@/lib/seo";
import { Markdown } from "@/components/ui/markdown";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const c = await getCollection((await params).slug);
  if (!c) notFound();
  const { items, total } = await listProducts({ collection: c.slug, perPage: 48 });
  const facts = listingFacts(total, items.map((i) => i.price));
  return {
    title: c.seoTitle ?? c.title,
    description: c.seoDescription ?? metaDescription(`${c.title} by QOWL${facts ? `: ${facts}` : ""}. ${c.description ?? ""}`),
    alternates: { canonical: listingCanonical(`/collections/${c.slug}`, await searchParams) },
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
      after={c.content?.trim() ? (
        <section aria-labelledby="page-copy" className="mx-auto mt-20 max-w-3xl border-t hairline pt-12">
          <h2 id="page-copy" className="display text-3xl text-obsidian sm:text-4xl">About {c.title.split(" / ")[0]}</h2>
          <div className="mt-6"><Markdown source={c.content} /></div>
        </section>
      ) : null}
    />
  );
}
