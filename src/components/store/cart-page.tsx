"use client";

import { useEffect } from "react";
import { useStore } from "@/components/providers/store";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { ArrowRight, Loader2 } from "@/components/ui/icons";
import { formatINR } from "@/lib/money";
import { CartIssuesBar, CartLines, CartTotals } from "./cart-lines";
import { CouponForm } from "./coupon-form";

export function CartPageClient() {
  const { cart, refreshCart } = useStore();
  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);
  if (!cart) return <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-forest" /><span className="sr-only">Loading</span></div>;
  if (!cart.items.length) return <EmptyState title="Your bag is empty" body="The code isn't written yet." action={<ButtonLink href="/collections/drop-001" icon={<ArrowRight className="h-4 w-4" />}>Shop Drop 001</ButtonLink>} />;
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <div>
        <CartLines cart={cart} />
        <CartIssuesBar cart={cart} />
      </div>
      <aside className="h-fit border hairline bg-white/40 p-6 lg:sticky lg:top-28" aria-label="Order summary">
        <h2 className="label-wide mb-5">Summary</h2>
        <CouponForm />
        <div className="mt-4"><CartTotals cart={cart} /></div>
        {cart.freeShippingRemaining != null && <p className="mt-3 text-xs text-forest">Add {formatINR(cart.freeShippingRemaining)} more for free shipping.</p>}
        {cart.canCheckout ? (
          <ButtonLink href="/checkout" className="mt-6 w-full" size="lg" icon={<ArrowRight className="h-4 w-4" />}>Checkout</ButtonLink>
        ) : (
          <p className="mt-6 text-sm text-danger" role="status">{cart.blockers[0]}</p>
        )}
        <p className="mt-4 text-xs text-stone">Shipping and taxes are confirmed at checkout. You can check out as a guest.</p>
      </aside>
    </div>
  );
}
