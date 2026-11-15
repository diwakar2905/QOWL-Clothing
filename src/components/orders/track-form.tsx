"use client";

import { useActionState } from "react";
import { submitKeepingValues } from "@/components/ui/action-form";
import { trackOrderAction } from "@/server/actions/orders";
import { Input, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { formatDateTime, safeHref } from "@/lib/utils";

export function TrackForm() {
  const [state, action, pending] = useActionState(trackOrderAction, null);
  const data = state?.ok ? state.data : null;
  return (
    <>
      <form action={action} onSubmit={submitKeepingValues(action)} className="mt-8 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input name="number" label="Order number" placeholder="QWL-000123" required autoCapitalize="characters" />
        <Input name="email" type="email" label="Email" autoComplete="email" required />
        <Button type="submit" loading={pending} className="h-12">Track</Button>
      </form>
      <div className="mt-6" aria-live="polite">
        {state && !state.ok && <FormMessage>{state.error.fields ? Object.values(state.error.fields)[0] : state.error.message}</FormMessage>}
        {data && (
          <section className="border hairline p-6">
            <p className="label text-stone">Order {data.number}</p>
            <p className="mt-1 font-serif text-3xl uppercase">{data.status}</p>
            <p className="text-sm text-charcoal/75">Placed {formatDateTime(data.placedAt)}</p>
            {data.shipments.map((s, i) => {
              const href = safeHref(s.trackingUrl);
              return (
                <div key={i} className="mt-5 border-t hairline pt-4 text-sm">
                  <p>{s.courier} {s.awb && <>· AWB <span className="font-mono">{s.awb}</span></>} {href && <a href={href} target="_blank" rel="noopener noreferrer" className="ml-2 text-forest underline">Courier tracking</a>}</p>
                  <ol className="mt-3 space-y-2 border-l hairline pl-4">
                    {s.events.map((e, j) => <li key={j}>{e.description}{e.location && <span className="text-stone"> · {e.location}</span>}<span className="block text-xs text-stone">{formatDateTime(e.at)}</span></li>)}
                  </ol>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </>
  );
}
