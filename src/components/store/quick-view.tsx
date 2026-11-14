"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Price, ConceptBadge } from "@/components/ui/misc";
import { Loader2 } from "@/components/ui/icons";
import { api } from "@/lib/client-api";
import { useStore } from "@/components/providers/store";
import { cn } from "@/lib/utils";

type QV = {
  id: string; name: string; slug: string; subtitle: string | null; description: string; price: number; mrp: number;
  colors: { id: string; name: string; hex: string }[];
  images: { url: string; alt: string; colorId: string | null; isConcept: boolean }[];
  variants: { id: string; colorId: string; size: string; price: number; available: number }[];
};

export function QuickView({ slug, open, onClose }: { slug: string; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<QV | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { addToCart } = useStore();

  useEffect(() => {
    if (!open || data) return;
    api<QV>(`/api/products/${encodeURIComponent(slug)}`)
      .then((d) => {
        setData(d);
        setColor(d.colors.find((c) => d.variants.some((v) => v.colorId === c.id && v.available > 0))?.id ?? d.colors[0]?.id ?? null);
      })
      .catch((e) => setError((e as Error).message));
  }, [open, slug, data]);

  const variants = data?.variants.filter((v) => v.colorId === color) ?? [];
  const selected = variants.find((v) => v.size === size) ?? null;
  const image = data?.images.find((i) => i.colorId === color) ?? data?.images[0];

  return (
    <Dialog open={open} onClose={onClose} title={data ? `Quick view: ${data.name}` : "Quick view"} hideTitle>
      {!data && !error && <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-forest" /></div>}
      {error && <p className="p-8 text-sm text-danger">{error}</p>}
      {data && (
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="relative aspect-[4/5] bg-cream">
            {image && <Image src={image.url} alt={image.alt} fill sizes="(max-width: 640px) 100vw, 400px" className="object-cover" />}
            {image?.isConcept && <ConceptBadge className="absolute bottom-2 left-2" />}
          </div>
          <div className="flex flex-col p-6 sm:p-8">
            <h2 className="display text-4xl text-obsidian">{data.name}</h2>
            {data.subtitle && <p className="mt-1 font-serif text-lg italic text-charcoal/80">{data.subtitle}</p>}
            <Price price={selected?.price ?? data.price} mrp={data.mrp} className="mt-3 text-xl font-medium" />
            <fieldset className="mt-6">
              <legend className="label mb-2">Colour: <span className="normal-case tracking-normal">{data.colors.find((c) => c.id === color)?.name}</span></legend>
              <div className="flex flex-wrap gap-2">
                {data.colors.map((c) => (
                  <button key={c.id} type="button" aria-pressed={color === c.id} aria-label={c.name} onClick={() => { setColor(c.id); setSize(null); }} className={cn("h-9 w-9 rounded-full border-2 p-0.5", color === c.id ? "border-forest" : "border-transparent")}>
                    <span className="block h-full w-full rounded-full border border-charcoal/20" style={{ backgroundColor: c.hex }} />
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-5">
              <legend className="label mb-2">Size</legend>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button key={v.id} type="button" disabled={v.available === 0} aria-pressed={size === v.size} onClick={() => setSize(v.size)} className={cn("h-10 min-w-12 border px-3 text-sm", size === v.size ? "border-forest bg-forest text-ivory" : "hairline hover:border-forest", v.available === 0 && "text-stone line-through")}>
                    {v.size}
                    {v.available === 0 && <span className="sr-only"> (sold out)</span>}
                  </button>
                ))}
              </div>
            </fieldset>
            <Button
              className="mt-7 w-full"
              disabled={!selected || selected.available === 0}
              loading={adding}
              onClick={async () => {
                if (!selected) return;
                setAdding(true);
                const ok = await addToCart(selected.id, 1);
                setAdding(false);
                if (ok) onClose();
              }}
            >
              {selected ? "Add to bag" : "Select a size"}
            </Button>
            <Link href={`/products/${data.slug}`} onClick={onClose} className="label mt-4 text-center text-forest link-underline self-center">View full details</Link>
          </div>
        </div>
      )}
    </Dialog>
  );
}
