"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { useStore } from "@/components/providers/store";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/icons";
import type { ProductCard as Card } from "@/server/services/catalog";
import { ProductCard } from "./product-card";

export function WishlistGrid({ initial, signedIn }: { initial: Card[] | null; signedIn: boolean }) {
  const { wishlist, wishlistReady } = useStore();
  const [cards, setCards] = useState<Card[] | null>(initial);
  const guestKey = [...wishlist].sort().join(",");
  useEffect(() => {
    if (initial || !wishlistReady) return;
    if (!guestKey) return setCards([]);
    api<Card[]>(`/api/products/cards?ids=${guestKey.split(",").map(encodeURIComponent).join(",")}`).then(setCards).catch(() => setCards([]));
  }, [initial, wishlistReady, guestKey]);
  // Hide items the customer un-saves while on this page.
  const list = cards === null ? null : wishlistReady ? cards.filter((c) => wishlist.has(c.id)) : cards;

  if (list === null) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-forest" /></div>;
  if (!list.length) {
    return <EmptyState title="Nothing saved yet" body="Tap the heart on any piece to save it here." action={<ButtonLink href="/shop">Shop all</ButtonLink>} />;
  }
  return (
    <>
      {!signedIn && (
        <p className="mb-6 bg-forest/5 px-4 py-3 text-sm text-forest">
          Your wishlist is saved on this device. <Link href="/login?next=/wishlist" className="underline underline-offset-4">Sign in</Link> to keep it across devices.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 lg:grid-cols-4">
        {list.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
      </ul>
    </>
  );
}
