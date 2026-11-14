import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listCollections, getFeaturedCards } from "@/server/services/catalog";
import { Breadcrumbs, ConceptBadge, Container, EmptyState } from "@/components/ui/misc";
import { ArrowRight, Sparkle } from "@/components/ui/icons";
import { cn, safeHref } from "@/lib/utils";

export const metadata: Metadata = { title: "Collections", description: "Explore the QOWL world — drops, edits and the lookbook.", alternates: { canonical: "/collections" } };

export default async function CollectionsPage() {
  const [collections, six] = await Promise.all([listCollections({ explore: true }), getFeaturedCards(6)]);
  return (
    <>
      <Container className="py-6 sm:py-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Collections" }]} />
        <div className="mt-6 flex items-center justify-center gap-4 sm:gap-8">
          <span aria-hidden className="hidden items-center gap-3 sm:flex"><span className="h-px w-16 bg-forest/40 lg:w-24" /><Sparkle className="h-5 w-5 text-forest" /></span>
          <h1 className="display text-center text-[2.5rem] text-obsidian sm:text-6xl lg:text-7xl">Explore the <em className="font-serif normal-case italic text-forest">QOWL</em> World</h1>
          <span aria-hidden className="hidden items-center gap-3 sm:flex"><Sparkle className="h-5 w-5 text-forest" /><span className="h-px w-16 bg-forest/40 lg:w-24" /></span>
        </div>
        <p className="mt-3 text-center font-serif text-xl italic text-charcoal/80">Six pieces. One code. Infinite ways to wear it.</p>
        {collections.length === 0 ? (
          <EmptyState title="Collections coming soon" body="Our first collections are being prepared." />
        ) : (
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {collections.map((c, i) => {
              const href = c.linkType === "EDITORIAL" ? safeHref(c.editorialHref) ?? `/collections/${c.slug}` : `/collections/${c.slug}`;
              return (
                <li key={c.id}>
                  <Link href={href} className="group relative block aspect-[4/3] overflow-hidden rounded-[3px] bg-forest-deep sm:aspect-[5/4] lg:aspect-[4/3.2]">
                    {c.heroImageUrl && (
                      <picture>
                        {c.mobileImageUrl && <source media="(max-width: 767px)" srcSet={c.mobileImageUrl} />}
                        <Image src={c.heroImageUrl} alt={c.imageAlt ?? c.title} fill priority={i < 3} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                      </picture>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-obsidian/75 via-obsidian/5 to-transparent" />
                    <div className="on-dark absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-ivory sm:p-6">
                      <h2 className="display max-w-[80%] text-3xl sm:text-[2.1rem]">{c.title}</h2>
                      <ArrowRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1.5" strokeWidth={1.2} />
                    </div>
                    {c.heroImageUrl?.startsWith("/concept/") && <ConceptBadge className="absolute right-2 top-2" text="Concept" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
      {six.length > 0 && (
        <section className="mt-12 border-t hairline bg-ivory py-12" aria-labelledby="six-heading">
          <Container>
            <h2 id="six-heading" className="display text-center text-5xl text-obsidian">The Six</h2>
            <p className="label-wide mt-2 text-center text-charcoal/80">Drop 001 — The Unwritten</p>
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {six.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.slug}`} className="group block">
                    <div className="relative aspect-[5/6] overflow-hidden rounded-[3px] bg-cream">
                      {(p.secondaryImage ?? p.primaryImage) && <Image src={(p.secondaryImage ?? p.primaryImage)!.url} alt={(p.secondaryImage ?? p.primaryImage)!.alt} fill sizes="(max-width: 640px) 50vw, 16vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />}
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-serif text-lg uppercase leading-tight">{p.name}</p>
                        <p className={cn("font-serif text-sm italic text-charcoal/75")}>{p.subtitle}</p>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0" strokeWidth={1.3} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}
    </>
  );
}
