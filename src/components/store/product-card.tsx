"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Price, ConceptBadge } from "@/components/ui/misc";
import { Heart, Plus, ChevronLeft, ChevronRight } from "@/components/ui/icons";
import { useStore } from "@/components/providers/store";
import type { ProductCard as Card } from "@/server/services/catalog";
import { QuickView } from "./quick-view";

type Props = { product: Card; variant?: "standard" | "overlay"; priority?: boolean; sizes?: string };

/**
 * Product card: a rounded image panel you can swipe (touch) or step through
 * (arrows on hover, dots below), wishlist on the image, and a quiet
 * name / price / quick-add row underneath.
 */
export function ProductCard({ product, variant = "standard", priority, sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" }: Props) {
  const { wishlist, toggleWishlist } = useStore();
  const [quick, setQuick] = useState(false);
  const saved = wishlist.has(product.id);
  const href = `/products/${product.slug}`;
  const images = product.images?.length ? product.images : [product.primaryImage, product.secondaryImage].filter((i): i is NonNullable<typeof i> => !!i);
  const soldOut = !product.inStock;
  const overlay = variant === "overlay";

  return (
    <article className="group/card relative">
      <div className={cn("relative overflow-hidden rounded-[22px] bg-cream sm:rounded-[28px]", overlay ? "aspect-[4/5]" : "aspect-[4/5]")}>
        <Slides images={images} href={href} name={product.name} priority={priority} sizes={sizes} dim={soldOut} />

        {overlay && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian/75 via-obsidian/5 to-transparent" />}

        {/* Top row: badges left, wishlist right */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
          <div className="flex flex-col items-start gap-1.5">
            {product.primaryImage?.isConcept && <ConceptBadge text="Concept" className="rounded-full" />}
            {soldOut && <span className="rounded-full bg-ivory/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-charcoal backdrop-blur">Sold out</span>}
            {!soldOut && product.onSale && <span className="rounded-full bg-forest px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory">Sale</span>}
          </div>
          <button
            type="button"
            onClick={() => toggleWishlist(product.id)}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-ivory/80 text-charcoal shadow-sm backdrop-blur transition hover:scale-105 hover:bg-ivory active:scale-95"
          >
            <Heart className={cn("h-[17px] w-[17px]", saved && "fill-forest text-forest")} strokeWidth={1.5} />
          </button>
        </div>

        {overlay && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 pb-7 text-ivory sm:p-5 sm:pb-8">
            <div className="min-w-0">
              <h3 className="font-serif text-2xl uppercase leading-none sm:text-[1.7rem]">{product.name}</h3>
              {product.subtitle && <p className="mt-1 font-serif text-sm italic text-ivory/85">{product.subtitle}</p>}
              <Price price={product.price} mrp={product.mrp} className="mt-1.5 text-sm font-medium" />
            </div>
            <QuickAddButton name={product.name} onClick={() => setQuick(true)} tone="light" />
          </div>
        )}
      </div>

      {!overlay && (
        <div className={cn("mt-3 flex items-start justify-between gap-3 px-1", soldOut && "opacity-60")}>
          <div className="min-w-0">
            <h3 className="truncate text-[13px] font-medium uppercase tracking-[0.06em] text-obsidian">
              <Link href={href} className="hover:text-forest">{product.name}</Link>
            </h3>
            {product.subtitle && <p className="truncate font-serif text-[15px] italic text-charcoal/70">{product.subtitle}</p>}
            <div className="mt-1 flex items-center gap-3">
              <Price price={product.price} mrp={product.mrp} className="text-[13px] text-charcoal" />
              {product.colors.length > 1 && (
                <ul className="flex gap-1" aria-label={`Available colours: ${product.colors.map((c) => c.name).join(", ")}`}>
                  {product.colors.map((c) => (
                    <li key={c.slug} title={c.name} className="h-2.5 w-2.5 rounded-full ring-1 ring-charcoal/20" style={{ backgroundColor: c.hex }} />
                  ))}
                </ul>
              )}
            </div>
          </div>
          <QuickAddButton name={product.name} onClick={() => setQuick(true)} />
        </div>
      )}

      <QuickView slug={product.slug} open={quick} onClose={() => setQuick(false)} />
    </article>
  );
}

function QuickAddButton({ name, onClick, tone = "dark" }: { name: string; onClick: () => void; tone?: "dark" | "light" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Quick add ${name}`}
      className={cn(
        "pointer-events-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95",
        tone === "light" ? "border-ivory/60 text-ivory hover:bg-ivory hover:text-forest" : "border-charcoal/20 text-charcoal hover:border-forest hover:bg-forest hover:text-ivory",
      )}
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}

function Slides({ images, href, name, priority, sizes, dim }: { images: { url: string; alt: string }[]; href: string; name: string; priority?: boolean; sizes: string; dim: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = images.length;

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = (i + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  };

  if (!count) {
    return (
      <Link href={href} className="flex h-full items-center justify-center font-serif text-2xl uppercase text-stone">
        {name}
      </Link>
    );
  }

  return (
    <>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
          if (i !== index) setIndex(i);
        }}
        className="scrollbar-none flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {images.map((img, i) => (
          <Link key={img.url + i} href={href} tabIndex={i === 0 ? 0 : -1} aria-label={i === 0 ? name : undefined} className="relative h-full w-full shrink-0 snap-start">
            <Image
              src={img.url}
              alt={i === 0 ? img.alt : ""}
              fill
              priority={priority && i === 0}
              sizes={sizes}
              draggable={false}
              className={cn("object-cover transition duration-700 ease-[var(--ease-editorial)] group-hover/card:scale-[1.02]", dim && "opacity-55 grayscale-[35%]")}
            />
          </Link>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={`Previous image of ${name}`}
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-obsidian/35 text-ivory opacity-0 backdrop-blur transition hover:bg-obsidian/55 focus-visible:opacity-100 group-hover/card:opacity-100 sm:inline-flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={`Next image of ${name}`}
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-obsidian/35 text-ivory opacity-0 backdrop-blur transition hover:bg-obsidian/55 focus-visible:opacity-100 group-hover/card:opacity-100 sm:inline-flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {images.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full bg-ivory shadow-sm transition-all", i === index ? "w-4" : "w-1.5 opacity-60")} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
