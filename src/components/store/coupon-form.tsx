"use client";

import { useState } from "react";
import { useStore } from "@/components/providers/store";
import { Button } from "@/components/ui/button";
import { X } from "@/components/ui/icons";

export function CouponForm() {
  const { cart, applyCoupon, removeCoupon } = useStore();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!cart) return null;
  if (cart.couponCode) {
    return (
      <div className="flex items-center justify-between border border-dashed border-forest/40 px-3 py-2 text-sm">
        <span>
          Code <strong className="tracking-wider">{cart.couponCode}</strong>{" "}
          {cart.couponError ? <span className="text-danger">— {cart.couponError}</span> : <span className="text-forest">applied</span>}
        </span>
        <button type="button" onClick={() => removeCoupon()} aria-label="Remove code" className="p-1 hover:text-danger"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setBusy(true);
        setErr(await applyCoupon(code.trim()));
        setBusy(false);
      }}
    >
      <label htmlFor="coupon" className="label mb-2 block">Discount code</label>
      <div className="flex">
        <input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" aria-invalid={!!err || undefined} aria-describedby="coupon-err" className="h-11 min-w-0 flex-1 border border-charcoal/20 bg-white/70 px-3 text-sm uppercase tracking-wider focus:border-forest focus:outline-none" />
        <Button type="submit" variant="outline" className="h-11 border-l-0" loading={busy}>Apply</Button>
      </div>
      <p id="coupon-err" role="alert" className="mt-1.5 min-h-4 text-xs text-danger">{err}</p>
    </form>
  );
}
