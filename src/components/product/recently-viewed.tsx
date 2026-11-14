"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "@/components/store/product-card";

/** Device-local history (localStorage); nothing is sent to analytics. */
export function RecentlyViewed({ excludeId }: { excludeId: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    let ids: string[] = [];
    try {
      ids = (JSON.parse(localStorage.getItem("qowl.recent.v1") ?? "[]") as string[]).filter((x) => typeof x === "string" && x !== excludeId).slice(0, 4);
    } catch {}
    if (ids.length) api<Card[]>(`/api/products/cards?ids=${ids.map(encodeURIComponent).join(",")}`).then(setCards).catch(() => {});
  }, [excludeId]);
  if (!cards.length) return null;
  return (
    <section className="mt-20" aria-labelledby="recent-heading">
      <h2 id="recent-heading" className="label-wide text-center text-charcoal">Recently viewed</h2>
      <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
        {cards.map((c) => <li key={c.id}><ProductCard product={c} /></li>)}
      </ul>
    </section>
  );
}
