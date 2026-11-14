"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Price } from "@/components/ui/misc";
import { Heart, Minus, Plus, Ruler, ShoppingBag, ArrowUpRight, Layers, Shirt, Scissors, RefreshCw, Truck, Info } from "@/components/ui/icons";
import { useStore } from "@/components/providers/store";
import { SizeTable } from "@/components/store/size-table";
import { Gallery, type GalleryImage } from "./gallery";
import { PincodeChecker } from "./pincode-checker";
import Link from "next/link";

export type PdpData = {
  id: string;
  name: string;
  slug: string;
  styleCode: string;
  subtitle: string | null;
  description: string;
  collectionLabel: string | null;
  mrp: number;
  price: number;
  colors: { id: string; name: string; hex: string }[];
  images: (GalleryImage & { colorId: string | null })[];
  variants: { id: string; colorId: string; size: string; price: number; available: number }[];
  details: { icon: "fabric" | "fit" | "detail" | "care"; title: string; body: string }[];
  detailsApproved: boolean;
  sizeGuide: { name: string; unit: string; columns: string[]; rows: unknown; fitNotes: string | null; modelInfo: string | null } | null;
  lowStockThreshold: number;
};

const ICONS = { fabric: Layers, fit: Shirt, detail: Scissors, care: RefreshCw };
const RV_KEY = "qowl.recent.v1";

export function ProductView({ p, conceptNotice, codEnabled, returnsSummary }: { p: PdpData; conceptNotice: string; codEnabled: boolean; returnsSummary: string | null }) {
  const router = useRouter();
  const { addToCart, wishlist, toggleWishlist } = useStore();
  const firstAvailableColor = p.colors.find((c) => p.variants.some((v) => v.colorId === c.id && v.available > 0)) ?? p.colors[0];
  const [colorId, setColorId] = useState(firstAvailableColor?.id ?? "");
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<"add" | "buy" | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  // Record recently viewed (local to this device only).
  useEffect(() => {
    try {
      const prev = (JSON.parse(localStorage.getItem(RV_KEY) ?? "[]") as string[]).filter((x) => typeof x === "string" && x !== p.id);
      localStorage.setItem(RV_KEY, JSON.stringify([p.id, ...prev].slice(0, 12)));
    } catch {}
  }, [p.id]);

  const color = p.colors.find((c) => c.id === colorId);
  const colorVariants = p.variants.filter((v) => v.colorId === colorId);
  const selected = colorVariants.find((v) => v.size === size) ?? null;
  const colorImages = p.images.filter((i) => i.colorId === colorId);
  const galleryImages = useMemo(() => (colorImages.length ? [...colorImages, ...p.images.filter((i) => !i.colorId)] : p.images), [colorImages, p.images]);
  const showingOtherColour = !colorImages.length && p.images.length > 0;
  const allSoldOut = p.variants.every((v) => v.available === 0);
  const maxQty = Math.min(10, selected?.available ?? 10);
  const saved = wishlist.has(p.id);

  const submit = async (mode: "add" | "buy") => {
    if (!selected) {
      setSizeError("Please select a size.");
      document.getElementById("size-options")?.focus();
      return;
    }
    setBusy(mode);
    const ok = await addToCart(selected.id, qty, { openDrawer: mode === "add" });
    setBusy(null);
    if (ok && mode === "buy") router.push("/checkout");
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.75fr)_minmax(340px,1fr)] lg:gap-12">
      <div>
        <Gallery images={galleryImages} conceptNotice={conceptNotice} />
        {showingOtherColour && <p className="mt-2 text-xs text-stone">Imagery for {color?.name} is coming soon; photos show another colourway.</p>}
      </div>

      <div className="lg:sticky lg:top-28 lg:self-start">
        {p.collectionLabel && (
          <p className="label-wide flex items-center gap-4 text-charcoal/85">
            {p.collectionLabel}
            <span aria-hidden className="h-px flex-1 bg-charcoal/25" />
          </p>
        )}
        <h1 className="display mt-4 text-5xl text-obsidian sm:text-[3.4rem]">{p.name}</h1>
        {p.subtitle && <p className="mt-1.5 font-serif text-xl italic text-charcoal/85">{p.subtitle}</p>}
        <div className="mt-3 flex items-baseline gap-3">
          <Price price={selected?.price ?? p.price} mrp={p.mrp} className="text-2xl font-medium text-obsidian" />
        </div>
        <p className="mt-1 text-xs text-stone">MRP {formatINR(p.mrp)} inclusive of all taxes</p>
        <p className="mt-4 text-[15px] leading-relaxed text-charcoal/90">{p.description}</p>

        <div className="mt-6 border-t hairline pt-5">
          <fieldset>
            <legend className="label mb-3">Colour: <span className="font-medium normal-case tracking-normal">{color?.name}</span></legend>
            <div className="flex flex-wrap gap-3">
              {p.colors.map((c) => {
                const soldOut = !p.variants.some((v) => v.colorId === c.id && v.available > 0);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={colorId === c.id}
                    aria-label={`${c.name}${soldOut ? " (sold out)" : ""}`}
                    onClick={() => {
                      setColorId(c.id);
                      const still = p.variants.find((v) => v.colorId === c.id && v.size === size && v.available > 0);
                      if (!still) setSize(null);
                    }}
                    className="group flex w-[72px] flex-col items-center gap-1.5 text-center"
                  >
                    <span className={cn("relative block h-12 w-14 rounded-[3px] border-2 p-[3px] transition-colors", colorId === c.id ? "border-forest" : "border-transparent group-hover:border-charcoal/30")}>
                      <span className="block h-full w-full rounded-[2px] border border-charcoal/15" style={{ backgroundColor: c.hex }} />
                      {soldOut && <span aria-hidden className="absolute inset-0 m-auto h-px w-[110%] -rotate-[25deg] bg-charcoal/50" />}
                    </span>
                    <span className="text-[11px] leading-tight text-charcoal/85">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <legend className="label">Size{selected ? `: ${selected.size}` : ""}</legend>
              {p.sizeGuide && (
                <button type="button" onClick={() => setGuideOpen(true)} className="flex items-center gap-1.5 text-xs hover:text-forest">
                  <Ruler className="h-3.5 w-3.5" strokeWidth={1.4} /> Size guide <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
            </div>
            <div id="size-options" tabIndex={-1} className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size" aria-describedby={sizeError ? "size-error" : undefined}>
              {colorVariants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={size === v.size}
                  disabled={v.available === 0}
                  onClick={() => {
                    setSize(v.size);
                    setSizeError(null);
                    setQty((q) => Math.min(q, Math.max(1, v.available)));
                  }}
                  className={cn(
                    "h-10 min-w-[3.25rem] rounded-full border px-4 text-sm transition-colors",
                    size === v.size ? "border-forest bg-forest text-ivory" : "border-charcoal/25 hover:border-forest",
                    v.available === 0 && "cursor-not-allowed border-dashed text-stone line-through hover:border-charcoal/25",
                  )}
                >
                  {v.size}
                  {v.available === 0 && <span className="sr-only"> — sold out</span>}
                </button>
              ))}
            </div>
            <div aria-live="polite" className="mt-2 min-h-5 text-xs">
              {sizeError && <p id="size-error" className="text-danger">{sizeError}</p>}
              {!sizeError && selected && selected.available > 0 && selected.available <= p.lowStockThreshold && <p className="text-warning">Only {selected.available} left in {selected.size}.</p>}
              {!sizeError && allSoldOut && <p className="text-danger">This piece is currently sold out.</p>}
            </div>
          </fieldset>

          <div className="mt-3 flex items-stretch gap-3">
            <div className="flex items-center border border-charcoal/25" role="group" aria-label="Quantity">
              <button type="button" className="flex h-12 w-10 items-center justify-center disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"><Minus className="h-3.5 w-3.5" /></button>
              <output className="w-6 text-center text-sm tabular-nums" aria-live="polite">{qty}</output>
              <button type="button" className="flex h-12 w-10 items-center justify-center disabled:opacity-40" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <Button className="h-12 flex-1" loading={busy === "add"} disabled={allSoldOut || busy !== null || (selected?.available === 0)} onClick={() => submit("add")} icon={null}>
              <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
              {allSoldOut ? "Sold out" : <>Add to bag <span aria-hidden>—</span> {formatINR((selected?.price ?? p.price) * qty)}</>}
            </Button>
            <button type="button" onClick={() => toggleWishlist(p.id)} aria-pressed={saved} aria-label={saved ? "Remove from wishlist" : "Save to wishlist"} className="flex h-12 w-12 shrink-0 items-center justify-center border border-charcoal/25 hover:border-forest hover:text-forest">
              <Heart className={cn("h-5 w-5", saved && "fill-current text-forest")} strokeWidth={1.4} />
            </button>
          </div>
          {!allSoldOut && (
            <Button variant="outline" className="mt-3 h-12 w-full border-forest text-forest" loading={busy === "buy"} disabled={busy !== null} onClick={() => submit("buy")}>
              Buy now
            </Button>
          )}
        </div>

        <div className="mt-8">
          <p className="label-wide flex items-center gap-4 text-forest">Made with intention<span aria-hidden className="h-px flex-1 bg-forest/25" /></p>
          {!p.detailsApproved && (
            <p className="mt-3 flex items-start gap-2 bg-warning/5 px-3 py-2 text-xs text-warning"><Info className="mt-px h-3.5 w-3.5 shrink-0" /> Specifications are provisional and will be confirmed before release.</p>
          )}
          <ul className="mt-4 space-y-3.5">
            {p.details.map((d) => {
              const Icon = ICONS[d.icon];
              return (
                <li key={d.title} className="flex gap-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-charcoal" strokeWidth={1.2} />
                  <div><p className="text-sm font-medium text-obsidian">{d.title}</p><p className="text-[13px] text-charcoal/75">{d.body}</p></div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-6 border-t hairline pt-5">
          <PincodeChecker codEnabled={codEnabled} />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <Link href="/pages/shipping-policy" className="flex items-center gap-2 hover:text-forest"><Truck className="h-4 w-4" strokeWidth={1.3} /> Shipping &amp; delivery</Link>
            <Link href="/pages/returns-and-exchanges" className="flex items-center gap-2 hover:text-forest"><RefreshCw className="h-4 w-4" strokeWidth={1.3} /> Returns &amp; exchanges</Link>
          </div>
          {returnsSummary && <p className="mt-2 text-xs text-stone">{returnsSummary}</p>}
        </div>
      </div>

      {/* Mobile sticky purchase bar */}
      {!allSoldOut && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t hairline bg-ivory/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-lg uppercase leading-none">{p.name}</p>
            <p className="text-xs text-charcoal/75">{color?.name}{selected ? ` / ${selected.size}` : " — select a size"}</p>
          </div>
          <Button size="md" loading={busy === "add"} onClick={() => submit("add")}>{formatINR((selected?.price ?? p.price) * qty)}<ShoppingBag className="h-4 w-4" /></Button>
        </div>
      )}

      {p.sizeGuide && (
        <Dialog open={guideOpen} onClose={() => setGuideOpen(false)} title="Size guide">
          <div className="p-6"><SizeTable guide={p.sizeGuide} /></div>
        </Dialog>
      )}
    </div>
  );
}
