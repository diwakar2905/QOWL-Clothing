import Image from "next/image";
import Link from "next/link";
import { safeHref } from "@/lib/utils";
import { ArrowRight, Sparkle, Layers, Scissors, Shirt, RefreshCw } from "@/components/ui/icons";
import { buttonClass } from "@/components/ui/button";
import { ConceptBadge, SectionHeading } from "@/components/ui/misc";
import { ProductCard } from "@/components/store/product-card";
import type { ProductCard as Card } from "@/server/services/catalog";
import type { SectionData } from "@/server/cms/sections";

export function Marquee({ data }: { data: SectionData<"MARQUEE"> }) {
  const items = data.items.length ? data.items : ["Designed to differ"];
  const row = Array.from({ length: 8 }, (_, i) => items[i % items.length]!);
  return (
    <div className="overflow-hidden border-y hairline bg-ivory py-3.5" aria-label={items.join(", ")}>
      <div className="flex w-max animate-marquee motion-reduce:animate-none" aria-hidden>
        {[...row, ...row].map((t, i) => (
          <span key={i} className="label-wide flex items-center gap-10 pr-10 text-charcoal">
            <Sparkle className="h-3 w-3 text-forest" /> {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProductShowcase({ data, products }: { data: SectionData<"PRODUCT_GRID">; products: Card[] }) {
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 sm:py-20 lg:px-10" aria-labelledby="showcase-heading">
      <div id="showcase-heading">
        <SectionHeading eyebrow={data.eyebrow || undefined} title={data.heading} subtitle={data.subheading || undefined} />
      </div>
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 lg:gap-6">
        {products.map((p, i) => (
          <div key={p.id}>
            <ProductCard product={p} variant="overlay" priority={i < 3} sizes="(max-width: 1024px) 50vw, 33vw" />
          </div>
        ))}
      </div>
      <div className="mt-10 flex justify-center">
        <Link href={data.mode === "collection" && data.collectionSlug ? `/collections/${data.collectionSlug}` : "/shop"} className={buttonClass("outline", "md")}>
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export function Campaign({ data }: { data: SectionData<"CAMPAIGN"> }) {
  const href = safeHref(data.ctaHref);
  return (
    <section className="haze on-dark relative overflow-hidden text-ivory" aria-labelledby="campaign-heading">
      <div className="mx-auto grid max-w-[1440px] items-stretch lg:grid-cols-[minmax(320px,0.9fr)_1.6fr]">
        <div className="relative z-10 flex flex-col justify-center px-6 py-14 sm:px-10 lg:py-24 lg:pl-12">
          <h2 id="campaign-heading" className="display text-5xl sm:text-6xl lg:text-[4.4rem]">{data.heading}</h2>
          <div className="mt-6 flex items-center gap-3" aria-hidden><span className="h-px w-40 bg-ivory/60" /><Sparkle className="h-3 w-3" /></div>
          {data.body && <p className="mt-5 max-w-xs font-serif text-lg italic text-ivory/90">{data.body}</p>}
          {href && data.ctaLabel && (
            <Link href={href} className={buttonClass("outline-light", "md", "mt-8 self-start")}>
              {data.ctaLabel} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        {data.imageUrl && (
          <div className="campaign-mask relative min-h-[320px] sm:min-h-[420px]">
            <picture>
              {data.mobileImageUrl && <source media="(max-width: 767px)" srcSet={data.mobileImageUrl} />}
              <Image src={data.imageUrl} alt={data.imageAlt} fill sizes="(max-width: 1024px) 100vw, 64vw" className="object-cover object-center" />
            </picture>
            {data.isConcept && <ConceptBadge className="absolute bottom-3 right-3" />}
          </div>
        )}
      </div>
    </section>
  );
}

export function CategoryTiles({ data }: { data: SectionData<"CATEGORY_TILES"> }) {
  if (!data.tiles.length) return null;
  return (
    <section className="mx-auto grid max-w-[1440px] gap-3 px-4 py-4 sm:grid-cols-2 sm:gap-4 sm:px-6 lg:px-10" aria-label="Shop by category">
      {data.tiles.map((t) => {
        const href = safeHref(t.href) ?? "/shop";
        return (
          <Link key={t.label} href={href} className="group relative block aspect-[16/9] overflow-hidden bg-forest-deep sm:aspect-[2/1]">
            {t.imageUrl && <Image src={t.imageUrl} alt={t.imageAlt} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover object-right opacity-80 transition-transform duration-700 group-hover:scale-[1.04]" />}
            <div className="absolute inset-0 bg-gradient-to-r from-forest-deep/90 via-forest-deep/40 to-transparent" />
            <div className="on-dark absolute inset-y-0 left-0 flex flex-col justify-center px-6 text-ivory sm:px-10">
              <p className="label-wide text-ivory/85">{t.eyebrow}</p>
              <h3 className="display mt-2 text-4xl sm:text-5xl">{t.label}</h3>
              <ArrowRight className="mt-4 h-6 w-6 transition-transform duration-500 group-hover:translate-x-2" strokeWidth={1.2} />
            </div>
            {t.isConcept && <ConceptBadge className="absolute bottom-2 right-2" />}
          </Link>
        );
      })}
    </section>
  );
}

const CRAFT_ICONS = [Layers, Sparkle, Scissors, RefreshCw, Shirt];

export function Craft({ data }: { data: SectionData<"CRAFT"> }) {
  // Only claims explicitly approved by an administrator are displayed.
  const items = data.items.filter((i) => i.approved);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-16 sm:px-6 lg:px-10" aria-labelledby="craft-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-10">
        <h2 id="craft-heading" className="display max-w-xs text-4xl text-obsidian sm:text-5xl">{data.heading}</h2>
        {data.body && <p className="max-w-sm border-l hairline pl-6 text-sm leading-relaxed text-charcoal/80 sm:pl-10">{data.body}</p>}
      </div>
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((it, i) => {
          const Icon = CRAFT_ICONS[i % CRAFT_ICONS.length]!;
          return (
            <li key={it.title}>
              <div className="relative aspect-[16/10] overflow-hidden bg-forest-deep">
                {it.imageUrl && <Image src={it.imageUrl} alt={it.imageAlt} fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-cover" />}
                {it.isConcept && <ConceptBadge className="absolute bottom-1.5 right-1.5" text="Concept" />}
              </div>
              <div className="mt-3 flex items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-forest" strokeWidth={1.4} />
                <div>
                  <p className="label text-obsidian">{it.title}</p>
                  {it.detail && <p className="label mt-0.5 font-medium text-stone">{it.detail}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LookbookTeaser({ data, images }: { data: SectionData<"LOOKBOOK">; images: { id: string; imageUrl: string; alt: string; isConcept: boolean }[] }) {
  const href = safeHref(data.ctaHref) ?? "/lookbook";
  return (
    <section className="mx-auto grid max-w-[1440px] items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(260px,0.8fr)_2fr] lg:px-10" aria-labelledby="lookbook-heading">
      <div>
        <p className="label-wide flex items-center gap-4 text-charcoal/80">{data.eyebrow}<span aria-hidden className="h-px w-16 bg-charcoal/40" /></p>
        <h2 id="lookbook-heading" className="display mt-4 text-5xl text-obsidian">{data.heading}</h2>
        {data.body && <p className="mt-3 max-w-[16rem] font-serif text-lg italic text-charcoal/80">{data.body}</p>}
        <Link href={href} className={buttonClass("outline", "md", "mt-7 border-forest text-forest")}>{data.ctaLabel} <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {images.map((im) => (
          <Link key={im.id} href={href} className="group relative block aspect-[4/5] overflow-hidden bg-cream">
            <Image src={im.imageUrl} alt={im.alt} fill sizes="(max-width: 1024px) 33vw, 22vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
            {im.isConcept && <ConceptBadge className="absolute bottom-1.5 left-1.5" text="Concept" />}
          </Link>
        ))}
      </div>
    </section>
  );
}
