"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Price, ConceptBadge } from "@/components/ui/misc";
import { Heart, ShoppingBag, Plus } from "@/components/ui/icons";
import { useStore } from "@/components/providers/store";
import type { ProductCard as Card } from "@/server/services/catalog";
import { QuickView } from "./quick-view";

export function ProductCard({ product, variant = "standard", priority, sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" }: { product: Card; variant?: "standard" | "overlay"; priority?: boolean; sizes?: string }) {
  const { wishlist, toggleWishlist } = useStore();
  const [quick, setQuick] = useState(false);
  const saved = wishlist.has(product.id);
  const href = `/products/${product.slug}`;
  const img = product.primaryImage;
  const alt2 = product.secondaryImage;

  const wishBtn = (
    <button
      type="button"
      onClick={() => toggleWishlist(product.id)}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      className={cn("inline-flex h-9 w-9 items-center justify-center transition-transform hover:scale-110", variant === "overlay" ? "text-ivory" : "text-charcoal")}
    >
      <Heart className={cn("h-[18px] w-[18px]", saved && "fill-current")} strokeWidth={1.4} />
    </button>
  );

  const media = (
    <div className="group/media relative aspect-[4/5] overflow-hidden bg-cream">
      {img ? (
        <>
          <Image src={img.url} alt={img.alt} fill priority={priority} sizes={sizes} className={cn("object-cover transition-[opacity,transform] duration-700 ease-[var(--ease-editorial)]", alt2 && "group-hover/card:opacity-0", "group-hover/card:scale-[1.03]")} />
          {alt2 && <Image src={alt2.url} alt="" aria-hidden fill sizes={sizes} className="object-cover opacity-0 transition-opacity duration-700 group-hover/card:opacity-100" />}
        </>
      ) : (
        <div className="flex h-full items-center justify-center font-serif text-2xl uppercase text-stone">{product.name}</div>
      )}
      {img?.isConcept && <ConceptBadge className="absolute left-2 top-2" text="Concept" />}
      {!product.inStock && <span className="absolute right-2 top-2 bg-ivory/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-charcoal">Sold out</span>}
    </div>
  );

  if (variant === "overlay") {
    return (
      <article className="group/card relative">
        <Link href={href} className="block" aria-label={`${product.name}, ${product.subtitle ?? ""}`}>
          {media}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian/80 via-obsidian/10 to-transparent" />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-ivory sm:p-5">
          <div>
            <h3 className="font-serif text-2xl uppercase leading-none sm:text-[1.7rem]">{product.name}</h3>
            {product.subtitle && <p className="mt-1 font-serif text-sm italic text-ivory/85">{product.subtitle}</p>}
            <Price price={product.price} mrp={product.mrp} className="mt-1.5 text-sm font-medium" />
          </div>
          <div className="pointer-events-auto flex items-center">
            {wishBtn}
            <button type="button" onClick={() => setQuick(true)} aria-label={`Quick view ${product.name}`} className="inline-flex h-9 w-9 items-center justify-center text-ivory transition-transform hover:scale-110">
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.4} />
            </button>
          </div>
        </div>
        <QuickView slug={product.slug} open={quick} onClose={() => setQuick(false)} />
      </article>
    );
  }

  return (
    <article className="group/card">
      <Link href={href} className="block">{media}</Link>
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-serif text-xl uppercase leading-tight text-obsidian">
            <Link href={href} className="hover:text-forest">{product.name}</Link>
          </h3>
          {product.subtitle && <p className="font-serif text-[15px] italic text-charcoal/75">{product.subtitle}</p>}
          <Price price={product.price} mrp={product.mrp} className="mt-1 text-[15px] font-medium text-obsidian" />
          {product.colors.length > 0 && (
            <ul className="mt-2 flex gap-1.5" aria-label={`Available colours: ${product.colors.map((c) => c.name).join(", ")}`}>
              {product.colors.map((c) => (
                <li key={c.slug} title={c.name} className="h-3.5 w-3.5 rounded-full border border-charcoal/20" style={{ backgroundColor: c.hex }} />
              ))}
            </ul>
          )}
        </div>
        <div className="-mr-2 flex shrink-0 items-center">
          {wishBtn}
          <button type="button" onClick={() => setQuick(true)} aria-label={`Quick view ${product.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-charcoal hover:text-forest">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current"><Plus className="h-3.5 w-3.5" /></span>
          </button>
        </div>
      </div>
      <QuickView slug={product.slug} open={quick} onClose={() => setQuick(false)} />
    </article>
  );
}
