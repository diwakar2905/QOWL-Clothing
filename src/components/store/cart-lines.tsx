"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatINR } from "@/lib/money";
import { Minus, Plus, Trash2, AlertTriangle } from "@/components/ui/icons";
import { useStore } from "@/components/providers/store";
import type { CartLineView, CartView } from "@/server/services/cart";
import { Button } from "@/components/ui/button";

function issueText(l: CartLineView): string | null {
  if (l.issues.includes("UNAVAILABLE")) return "No longer available.";
  if (l.issues.includes("OUT_OF_STOCK")) return "Out of stock in this size.";
  if (l.issues.includes("INSUFFICIENT_STOCK")) return `Only ${l.available} left — reduce the quantity to continue.`;
  if (l.issues.includes("PRICE_CHANGED")) return `Price changed from ${formatINR(l.priceSeen)} to ${formatINR(l.unitPrice)}.`;
  return null;
}

export function CartLines({ cart, compact, onNavigate }: { cart: CartView; compact?: boolean; onNavigate?: () => void }) {
  const { updateQuantity, removeItem } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    await fn();
    setBusy(null);
  };
  return (
    <ul className="divide-y hairline">
      {cart.items.map((l) => {
        const issue = issueText(l);
        const blocked = l.issues.some((i) => i !== "PRICE_CHANGED");
        return (
          <li key={l.id} className="flex gap-4 py-5" aria-busy={busy === l.id}>
            <Link href={`/products/${l.productSlug}`} onClick={onNavigate} className="relative block aspect-[4/5] w-[88px] shrink-0 overflow-hidden bg-cream sm:w-[104px]">
              {l.imageUrl && <Image src={l.imageUrl} alt={l.imageAlt} fill sizes="104px" className="object-cover" />}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/products/${l.productSlug}`} onClick={onNavigate} className="font-serif text-xl uppercase leading-tight text-obsidian hover:text-forest">
                    {l.productName}
                  </Link>
                  <p className="mt-1 text-[13px] text-charcoal/75">
                    {l.colorName} / {l.size}
                  </p>
                  {!compact && <p className="mt-0.5 text-[11px] uppercase tracking-wider text-stone">SKU {l.sku}</p>}
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">{formatINR(l.lineSubtotal)}</p>
              </div>
              {issue && (
                <p className={`mt-2 flex items-start gap-1.5 text-xs ${blocked ? "text-danger" : "text-warning"}`}>
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {issue}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between pt-3">
                <div className="flex items-center border hairline" role="group" aria-label={`Quantity for ${l.productName}`}>
                  <button type="button" className="flex h-9 w-9 items-center justify-center hover:text-forest disabled:opacity-40" aria-label="Decrease quantity" disabled={busy === l.id || l.quantity <= 1} onClick={() => run(l.id, () => updateQuantity(l.id, l.quantity - 1))}>
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{l.quantity}</span>
                  <button type="button" className="flex h-9 w-9 items-center justify-center hover:text-forest disabled:opacity-40" aria-label="Increase quantity" disabled={busy === l.id || l.quantity >= Math.min(10, l.available)} onClick={() => run(l.id, () => updateQuantity(l.id, l.quantity + 1))}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button type="button" onClick={() => run(l.id, () => removeItem(l.id))} disabled={busy === l.id} className="inline-flex items-center gap-1.5 text-xs text-charcoal/70 hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CartIssuesBar({ cart }: { cart: CartView }) {
  const { reconcile } = useStore();
  const [busy, setBusy] = useState(false);
  const hasIssues = cart.items.some((i) => i.issues.length > 0);
  if (!hasIssues) return null;
  return (
    <div className="border border-warning/30 bg-warning/5 p-4 text-sm text-charcoal" role="status">
      <p className="mb-3">Some items have changed since you added them. Review the notes above, then update your bag to accept current prices and availability.</p>
      <Button size="sm" variant="outline" loading={busy} onClick={async () => { setBusy(true); await reconcile(); setBusy(false); }}>
        Update bag
      </Button>
    </div>
  );
}

export function CartTotals({ cart }: { cart: CartView }) {
  const p = cart.pricing;
  return (
    <dl className="space-y-2.5 text-sm">
      <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(p.subtotal)}</dd></div>
      {p.discountTotal > 0 && (
        <div className="flex justify-between text-forest"><dt>Discount{cart.couponCode ? ` (${cart.couponCode})` : ""}</dt><dd className="tabular-nums">−{formatINR(p.discountTotal)}</dd></div>
      )}
      <div className="flex justify-between">
        <dt>Shipping</dt>
        <dd className="tabular-nums">{!p.shippingConfigured ? "Calculated at checkout" : p.shippingTotal === 0 ? "Free" : formatINR(p.shippingTotal)}</dd>
      </div>
      {p.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd className="tabular-nums">{formatINR(p.codFee)}</dd></div>}
      <div className="flex justify-between border-t hairline pt-3 text-base font-medium"><dt>Total</dt><dd className="tabular-nums">{formatINR(p.grandTotal)}</dd></div>
      <p className="text-xs text-stone">Prices include GST{p.taxTotal > 0 ? ` (${formatINR(p.taxTotal)})` : ""}.</p>
    </dl>
  );
}
