"use client";

import { Dialog } from "@/components/ui/dialog";
import { ButtonLink } from "@/components/ui/button";
import { useStore } from "@/components/providers/store";
import { formatINR } from "@/lib/money";
import { ArrowRight, Loader2 } from "@/components/ui/icons";
import { CartIssuesBar, CartLines, CartTotals } from "@/components/store/cart-lines";

export function CartDrawer() {
  const { drawerOpen, setDrawerOpen, cart, cartLoading } = useStore();
  const close = () => setDrawerOpen(false);
  return (
    <Dialog open={drawerOpen} onClose={close} title={`Your bag${cart ? ` (${cart.count})` : ""}`} variant="drawer">
      <div className="flex h-full flex-col">
        {!cart && cartLoading && (
          <div className="flex flex-1 items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-forest" /><span className="sr-only">Loading your bag</span></div>
        )}
        {cart && cart.items.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
            <p className="display text-3xl text-obsidian">Your bag is empty</p>
            <p className="mt-2 text-sm text-charcoal/75">The code isn&apos;t written yet.</p>
            <ButtonLink href="/collections/drop-001" className="mt-8" icon={<ArrowRight className="h-4 w-4" />}>Shop Drop 001</ButtonLink>
          </div>
        )}
        {cart && cart.items.length > 0 && (
          <>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6">
              {cart.freeShippingRemaining != null && (
                <p className="mt-4 bg-forest/5 px-3 py-2 text-xs text-forest">Add {formatINR(cart.freeShippingRemaining)} more for free shipping.</p>
              )}
              <CartLines cart={cart} compact onNavigate={close} />
              <div className="pb-4"><CartIssuesBar cart={cart} /></div>
            </div>
            <div className="border-t hairline bg-ivory px-5 py-5 sm:px-6">
              <CartTotals cart={cart} />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <ButtonLink href="/cart" variant="outline" className="w-full">View bag</ButtonLink>
                {cart.canCheckout ? (
                  <ButtonLink href="/checkout" className="w-full" icon={<ArrowRight className="h-4 w-4" />}>Checkout</ButtonLink>
                ) : (
                  <span className="label inline-flex h-11 w-full items-center justify-center border border-charcoal/20 text-stone" aria-disabled>Checkout</span>
                )}
              </div>
              {!cart.canCheckout && cart.blockers[0] && <p className="mt-3 text-xs text-danger" role="status">{cart.blockers[0]}</p>}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
