"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormMessage, Textarea } from "@/components/ui/form";
import { requestCancelAction } from "@/server/actions/orders";

export function OrderActions({ number, token, canCancel, returnEligible }: { number: string; token: string | null; canCancel: boolean; returnEligible: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      {returnEligible && <Link href={`/account/orders/${number}/return`} className="label border border-forest px-4 py-2.5 text-forest hover:bg-forest hover:text-ivory">Return / exchange</Link>}
      {canCancel && <Button type="button" variant="outline" size="sm" className="h-auto py-2.5" onClick={() => setOpen(true)}>Cancel order</Button>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Request cancellation">
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await requestCancelAction(number, token, reason);
              if (r.ok) {
                setMsg({ tone: "success", text: r.message ?? "Requested." });
                router.refresh();
              } else setMsg({ tone: "error", text: r.error.fields?._ ?? r.error.message });
            });
          }}
        >
          <p className="text-sm text-charcoal/80">Orders can be cancelled until they&apos;re packed. If you paid online, the refund goes back to your original payment method once the cancellation is confirmed.</p>
          <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required />
          {msg && <FormMessage tone={msg.tone}>{msg.text}</FormMessage>}
          <div className="flex gap-3"><Button type="submit" loading={pending}>Request cancellation</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep order</Button></div>
        </form>
      </Dialog>
    </>
  );
}
