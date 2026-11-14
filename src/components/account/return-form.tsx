"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { requestReturnAction } from "@/server/actions/orders";
import { uploadReturnPhotoAction } from "@/server/actions/account";
import { Upload, X } from "@/components/ui/icons";

type Item = { id: string; name: string; variant: string; max: number; options: { id: string; label: string }[] };

export function ReturnRequestForm({ number, allowReturn, allowExchange, reasons, requirePhotos, items }: { number: string; allowReturn: boolean; allowExchange: boolean; reasons: string[]; requirePhotos: boolean; items: Item[] }) {
  const router = useRouter();
  const [type, setType] = useState<"RETURN" | "EXCHANGE">(allowReturn ? "RETURN" : "EXCHANGE");
  const [sel, setSel] = useState<Record<string, { qty: number; exchange?: string }>>({});
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);

  const submit = () =>
    start(async () => {
      const chosen = Object.entries(sel).filter(([, v]) => v.qty > 0);
      if (!chosen.length) return setMsg({ tone: "error", text: "Select at least one item." });
      const r = await requestReturnAction(number, null, { type, reason, customerNote: note || undefined, photoUrls: photos, items: chosen.map(([orderItemId, v]) => ({ orderItemId, quantity: v.qty, exchangeVariantId: v.exchange })) });
      if (r.ok) {
        setMsg({ tone: "success", text: `Request ${(r.data as { number: string }).number} submitted. We'll email you with next steps.` });
        setTimeout(() => router.push(`/account/orders/${number}`), 1500);
      } else setMsg({ tone: "error", text: r.error.fields ? Object.values(r.error.fields)[0]! : r.error.message });
    });

  return (
    <div className="mt-8 space-y-8">
      {allowReturn && allowExchange && (
        <fieldset className="flex gap-3">
          <legend className="label mb-3">I&apos;d like to</legend>
          {(["RETURN", "EXCHANGE"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={cn("label h-11 border px-5", type === t ? "border-forest bg-forest text-ivory" : "hairline")}>{t === "RETURN" ? "Return for refund" : "Exchange size/colour"}</button>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend className="label mb-3">Items</legend>
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className={cn("border p-4 text-sm", (sel[i.id]?.qty ?? 0) > 0 ? "border-forest" : "hairline", i.max <= 0 && "opacity-50")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span><span className="font-medium">{i.name}</span> <span className="text-charcoal/75">{i.variant}</span></span>
                {i.max > 0 ? (
                  <label className="flex items-center gap-2">Qty
                    <select className="border hairline bg-transparent px-2 py-1" value={sel[i.id]?.qty ?? 0} onChange={(e) => setSel((s) => ({ ...s, [i.id]: { ...s[i.id], qty: Number(e.target.value) } }))}>
                      {Array.from({ length: i.max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                ) : <span className="text-xs">Already requested</span>}
              </div>
              {type === "EXCHANGE" && (sel[i.id]?.qty ?? 0) > 0 && (
                i.options.length ? (
                  <Select className="mt-3" label="Exchange for" value={sel[i.id]?.exchange ?? ""} onChange={(e) => setSel((s) => ({ ...s, [i.id]: { ...s[i.id]!, exchange: e.target.value } }))}>
                    <option value="" disabled>Choose size / colour</option>
                    {i.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                ) : <p className="mt-2 text-xs text-danger">No other sizes/colours are currently in stock for an exchange.</p>
              )}
            </li>
          ))}
        </ul>
      </fieldset>
      <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required>
        <option value="" disabled>Select a reason</option>
        {reasons.map((r) => <option key={r}>{r}</option>)}
      </Select>
      <Textarea label="Details" optional value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      <div>
        <p className="label mb-2">Photos {requirePhotos ? "(required)" : "(optional)"}</p>
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <span key={p} className="relative h-20 w-20 overflow-hidden bg-cream">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="Uploaded return photo" className="h-full w-full object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((y) => y !== p))} className="absolute right-0 top-0 bg-ivory p-0.5"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {photos.length < 5 && (
            <label className={cn("flex h-20 w-20 cursor-pointer flex-col items-center justify-center border border-dashed hairline text-xs", uploading && "opacity-50")}>
              <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Add"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                const fd = new FormData();
                fd.set("file", f);
                const r = await uploadReturnPhotoAction(fd);
                setUploading(false);
                if (r.ok) setPhotos((x) => [...x, (r.data as { url: string }).url]);
                else setMsg({ tone: "error", text: r.error.message });
                e.target.value = "";
              }} />
            </label>
          )}
        </div>
      </div>
      {msg && <FormMessage tone={msg.tone}>{msg.text}</FormMessage>}
      <Button type="button" onClick={submit} loading={pending} disabled={!reason}>Submit request</Button>
    </div>
  );
}
