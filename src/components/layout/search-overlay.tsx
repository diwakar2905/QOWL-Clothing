"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Search, ArrowRight, Loader2 } from "@/components/ui/icons";
import { api } from "@/lib/client-api";

type Suggest = { products: { name: string; slug: string }[]; suggestion: string | null };

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Suggest | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setRes(await api<Suggest>(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }));
      } catch {
        /* aborted or failed: keep previous suggestions */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Short queries show the "popular" chips rather than stale results.
  const shown = q.trim().length < 2 ? null : res;
  const go = (query: string) => {
    if (!query.trim()) return;
    onClose();
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Search" className="!top-0 !mt-0 !mb-auto max-w-none w-full sm:w-full">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          className="flex items-center gap-3 border-b border-charcoal/40 pb-3 focus-within:border-forest"
        >
          <Search className="h-5 w-5 text-charcoal" strokeWidth={1.4} />
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <input
            ref={inputRef}
            id="site-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Origin, hoodies, forest green…"
            autoComplete="off"
            maxLength={80}
            className="flex-1 bg-transparent font-serif text-2xl text-obsidian placeholder:text-stone/60 focus:outline-none sm:text-3xl"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-stone" />}
          <button type="submit" className="label text-forest" aria-label="Submit search">
            <ArrowRight className="h-5 w-5" strokeWidth={1.4} />
          </button>
        </form>
        <div className="mt-6 min-h-24" aria-live="polite">
          {shown && shown.products.length > 0 && (
            <ul className="divide-y hairline">
              {shown.products.map((p) => (
                <li key={p.slug}>
                  <Link href={`/products/${p.slug}`} onClick={onClose} className="flex items-center justify-between py-3 font-serif text-xl uppercase text-obsidian hover:text-forest">
                    {p.name}
                    <ArrowRight className="h-4 w-4" strokeWidth={1.4} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {shown && shown.products.length === 0 && (
            <p className="text-sm text-charcoal/80">
              No matches for “{q}”.
              {shown.suggestion && (
                <>
                  {" "}Did you mean{" "}
                  <button type="button" onClick={() => setQ(shown.suggestion!)} className="font-medium text-forest underline underline-offset-4">
                    {shown.suggestion}
                  </button>
                  ?
                </>
              )}
            </p>
          )}
          {!shown && (
            <div className="flex flex-wrap gap-2">
              <span className="label mr-2 self-center text-stone">Popular</span>
              {["Hoodies", "T-Shirts", "Drop 001", "Forest Green"].map((s) => (
                <button key={s} type="button" onClick={() => go(s)} className="border hairline px-3 py-1.5 text-sm hover:border-forest hover:text-forest">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
