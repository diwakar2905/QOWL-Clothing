"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ATextarea } from "@/components/ui/fields";
import { Star } from "@/components/ui/icons";
import { submitReviewAction } from "@/server/actions/account";

export function ReviewPrompts({ items }: { items: { id: string; name: string; variant: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  if (!items.length) return null;
  const item = items.find((i) => i.id === open);
  return (
    <section className="border hairline p-5">
      <h2 className="label-wide mb-3">Review your pieces</h2>
      <ul className="flex flex-wrap gap-3">
        {items.map((i) => <li key={i.id}><button type="button" onClick={() => setOpen(i.id)} className="border hairline px-4 py-2 text-sm hover:border-forest">Review {i.name} <span className="text-stone">({i.variant})</span></button></li>)}
      </ul>
      <Dialog open={!!item} onClose={() => setOpen(null)} title={`Review ${item?.name ?? ""}`}>
        {item && (
          <ActionForm action={async (p, f) => { const r = await submitReviewAction(p, f); if (r.ok) setOpen(null); return r; }} className="space-y-4 p-6" submitLabel="Submit review">
            <input type="hidden" name="orderItemId" value={item.id} />
            <input type="hidden" name="rating" value={rating} />
            <fieldset>
              <legend className="label mb-2">Rating</legend>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n} onClick={() => setRating(n)}><Star className={n <= rating ? "h-6 w-6 fill-forest text-forest" : "h-6 w-6 text-silver"} /></button>)}
              </div>
            </fieldset>
            <AInput name="title" label="Title" optional maxLength={80} />
            <ATextarea name="body" label="Your review" required maxLength={2000} />
            <p className="text-xs text-stone">Reviews are moderated and shown with a verified-purchase marker.</p>
          </ActionForm>
        )}
      </Dialog>
    </section>
  );
}
