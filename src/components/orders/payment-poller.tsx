"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "@/components/ui/icons";

/** Polls order status (the server reconciles with the gateway) until it's no longer pending. */
export function PaymentPoller({ number, token }: { number: string; token: string | null }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    let n = 0;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      n++;
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(number)}/status${token ? `?t=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" });
        const body = (await res.json()) as { ok: boolean; data?: { status: string } };
        if (body.ok && body.data && body.data.status !== "PENDING_PAYMENT") {
          router.refresh();
          return;
        }
      } catch {}
      if (n >= 15) return setTimedOut(true);
      setTimeout(tick, Math.min(2000 + n * 500, 6000));
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [number, token, router]);
  return (
    <p className="mt-6 flex items-center justify-center gap-2 text-sm text-charcoal/80" role="status">
      {timedOut ? "Still waiting on confirmation. You'll receive an email once your payment is confirmed — you can safely close this page." : <><Loader2 className="h-4 w-4 animate-spin" /> Checking payment status…</>}
    </p>
  );
}
