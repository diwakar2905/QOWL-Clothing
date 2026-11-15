"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, Loader2 } from "@/components/ui/icons";
import { SortMenu } from "./sort-menu";

type Facets = { sizes: string[]; colors: { name: string; hex: string; slug: string }[]; priceRange: [number, number] };

export function ListingToolbar({ facets, total, popularityAvailable, categoryTabs }: { facets: Facets; total: number; popularityAvailable: boolean; categoryTabs?: { label: string; value: string; count: number }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const update = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mut(p);
    p.delete("page");
    start(() => router.push(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false }));
  };
  const toggleList = (key: string, value: string) =>
    update((p) => {
      const cur = new Set((p.get(key) ?? "").split(",").filter(Boolean));
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      if (cur.size) p.set(key, [...cur].join(","));
      else p.delete(key);
    });
  const sizes = new Set((sp.get("size") ?? "").split(",").filter(Boolean));
  const colors = new Set((sp.get("color") ?? "").split(",").filter(Boolean));
  const activeCount = sizes.size + colors.size + (sp.get("min") ? 1 : 0) + (sp.get("max") ? 1 : 0) + (sp.get("stock") ? 1 : 0);
  const category = sp.get("category") ?? "";

  const sortOptions = [
    { v: "", l: "Featured" },
    { v: "newest", l: "Newest" },
    { v: "price_asc", l: "Price: low to high" },
    { v: "price_desc", l: "Price: high to low" },
    ...(popularityAvailable ? [{ v: "popular", l: "Most popular" }] : []),
  ];

  const filterBody = (
    <div className="space-y-8">
      {facets.sizes.length > 0 && (
        <fieldset>
          <legend className="label mb-3">Size</legend>
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => (
              <button key={s} type="button" aria-pressed={sizes.has(s)} onClick={() => toggleList("size", s)} className={cn("h-10 min-w-12 border px-3 text-sm", sizes.has(s) ? "border-forest bg-forest text-ivory" : "hairline hover:border-forest")}>
                {s}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {facets.colors.length > 0 && (
        <fieldset>
          <legend className="label mb-3">Colour</legend>
          <div className="grid grid-cols-2 gap-2">
            {facets.colors.map((c) => (
              <button key={c.slug} type="button" aria-pressed={colors.has(c.slug)} onClick={() => toggleList("color", c.slug)} className={cn("flex items-center gap-2.5 border px-3 py-2 text-left text-sm", colors.has(c.slug) ? "border-forest" : "hairline hover:border-forest")}>
                <span className="h-4 w-4 shrink-0 rounded-full border border-charcoal/20" style={{ backgroundColor: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="label mb-3">Price (₹)</legend>
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            update((p) => {
              for (const k of ["min", "max"]) {
                const v = String(f.get(k) ?? "").trim();
                if (v && /^\d{1,6}$/.test(v)) p.set(k, v);
                else p.delete(k);
              }
            });
          }}
        >
          <label className="flex-1 text-xs text-stone">Min<input name="min" inputMode="numeric" pattern="\d*" defaultValue={sp.get("min") ?? ""} placeholder={String(Math.floor(facets.priceRange[0] / 100))} className="mt-1 h-10 w-full border hairline bg-white/70 px-3 text-sm text-charcoal" /></label>
          <label className="flex-1 text-xs text-stone">Max<input name="max" inputMode="numeric" pattern="\d*" defaultValue={sp.get("max") ?? ""} placeholder={String(Math.ceil(facets.priceRange[1] / 100))} className="mt-1 h-10 w-full border hairline bg-white/70 px-3 text-sm text-charcoal" /></label>
          <Button type="submit" size="sm" variant="outline" className="h-10">Apply</Button>
        </form>
      </fieldset>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-forest" checked={sp.get("stock") === "1"} onChange={(e) => update((p) => (e.target.checked ? p.set("stock", "1") : p.delete("stock")))} />
        In stock only
      </label>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 border-b hairline pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {categoryTabs?.map((t) => (
          <button key={t.value} type="button" aria-pressed={category === t.value} onClick={() => update((p) => (t.value ? p.set("category", t.value) : p.delete("category")))} className={cn("label h-10 border px-4", category === t.value ? "border-forest bg-forest text-ivory" : "border-charcoal/30 hover:border-forest")}>
            {t.label} <span className="ml-1.5 tabular-nums opacity-80">{String(t.count).padStart(2, "0")}</span>
          </button>
        ))}
        {!categoryTabs && <p className="text-sm text-charcoal/75" aria-live="polite">{total} {total === 1 ? "product" : "products"}</p>}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-forest" aria-label="Updating results" />}
      </div>
      <div className="flex items-center gap-4">
        <SortMenu value={sp.get("sort") ?? ""} options={sortOptions} onChange={(v) => update((p) => (v ? p.set("sort", v) : p.delete("sort")))} />
        <span aria-hidden className="h-6 w-px bg-charcoal/20" />
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm font-medium hover:text-forest" aria-haspopup="dialog">
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.4} /> Filter{activeCount ? ` (${activeCount})` : ""}
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Filter" variant="drawer">
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-6">{filterBody}</div>
          <div className="grid grid-cols-2 gap-3 border-t hairline px-6 py-4">
            <Button variant="outline" onClick={() => update((p) => ["size", "color", "min", "max", "stock"].forEach((k) => p.delete(k)))}>Clear all</Button>
            <Button onClick={() => setOpen(false)}>Show {total} results</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
