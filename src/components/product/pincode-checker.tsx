"use client";

import { useState } from "react";
import { api, ApiCallError } from "@/lib/client-api";
import { Truck, Loader2 } from "@/components/ui/icons";

type Result = { pincode: string; serviceable: boolean; codAvailable: boolean; message: string };

export function PincodeChecker({ codEnabled }: { codEnabled: boolean }) {
  const [pin, setPin] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <form
        className="flex"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setRes(null);
          if (!/^[1-9][0-9]{5}$/.test(pin)) return setErr("Enter a valid 6-digit PIN code.");
          setLoading(true);
          try {
            setRes(await api<Result>(`/api/delivery?pincode=${pin}`));
          } catch (e2) {
            setErr((e2 as ApiCallError).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <label htmlFor="pdp-pin" className="sr-only">Delivery PIN code</label>
        <div className="flex flex-1 items-center gap-2 border hairline bg-white/60 px-3 focus-within:border-forest">
          <Truck className="h-4 w-4 text-stone" strokeWidth={1.4} />
          <input id="pdp-pin" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Check delivery — enter PIN code" className="h-11 flex-1 bg-transparent text-sm focus:outline-none" aria-describedby="pdp-pin-result" />
        </div>
        <button type="submit" className="label border border-l-0 border-charcoal/20 px-4 hover:text-forest" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
        </button>
      </form>
      <div id="pdp-pin-result" aria-live="polite" className="mt-2 text-xs">
        {err && <p className="text-danger">{err}</p>}
        {res && (
          <p className={res.serviceable ? "text-success" : "text-danger"}>
            {res.message}
            {res.serviceable && codEnabled && <span className="text-charcoal/75"> {res.codAvailable ? "Cash on Delivery available." : "Cash on Delivery not available."}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
