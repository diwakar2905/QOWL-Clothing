"use client";

import Image from "next/image";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ASelect, ACheckbox } from "@/components/ui/fields";
import { ActionButton } from "./client";
import { paiseToRupeesString } from "@/lib/money";
import { saveColorAction, deleteColorAction, generateVariantsAction, updateVariantAction, uploadProductImagesAction, updateImageAction, moveImageAction, deleteImageAction, setProductStatusAction } from "@/server/actions/admin/catalog";
import { Badge } from "@/components/ui/misc";

type Color = { id: string; name: string; hex: string };
type Variant = { id: string; colorId: string; size: string; sku: string; priceOverride: number | null; isActive: boolean; onHand: number; reserved: number };
type Img = { id: string; url: string; alt: string; colorId: string | null; kind: string; isConcept: boolean };
const KINDS = ["FRONT", "BACK", "SIDE", "DETAIL", "FABRIC", "MODEL", "OTHER"];

export function StatusPanel({ id, status, publishAt, blockers, canPublish, slug }: { id: string; status: string; publishAt: string; blockers: string[]; canPublish: boolean; slug: string }) {
  const [when, setWhen] = useState(publishAt);
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-center gap-2">Current status: <Badge tone={status === "ACTIVE" ? "success" : "neutral"}>{status}</Badge></p>
      {blockers.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-warning">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
      )}
      {canPublish ? (
        <>
          <label className="block text-xs">Publish at (IST, optional — schedule)
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 block h-10 w-full border hairline bg-white/60 px-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="primary" disabled={blockers.length > 0} action={() => setProductStatusAction(id, "ACTIVE", when || undefined)}>{when ? "Schedule" : "Publish"}</ActionButton>
            {status !== "DRAFT" && <ActionButton action={() => setProductStatusAction(id, "DRAFT")}>Unpublish</ActionButton>}
            {status !== "ARCHIVED" && <ActionButton variant="danger" confirm="Archive this product? It will be hidden from the store." action={() => setProductStatusAction(id, "ARCHIVED")}>Archive</ActionButton>}
          </div>
        </>
      ) : <p className="text-stone">You don&apos;t have permission to publish.</p>}
      <a href={`/products/${slug}?preview=1`} target="_blank" className="label inline-block text-forest underline">Preview product page</a>
    </div>
  );
}

export function VariantsPanel({ productId, colors, variants }: { productId: string; colors: Color[]; variants: Variant[] }) {
  const [editColor, setEditColor] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      {colors.map((c) => (
        <div key={c.id} className="border hairline">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-cream/50 px-4 py-3">
            <p className="flex items-center gap-2 font-medium"><span className="h-5 w-5 rounded-full border border-charcoal/20" style={{ backgroundColor: c.hex }} /> {c.name}</p>
            <div className="flex gap-2">
              <button type="button" className="label text-forest" onClick={() => setEditColor(editColor === c.id ? null : c.id)}>Edit colour</button>
              <ActionButton size="sm" variant="ghost" confirm={`Delete ${c.name} and its variants?`} action={() => deleteColorAction(productId, c.id)}>Delete</ActionButton>
            </div>
          </div>
          {editColor === c.id && (
            <ActionForm action={saveColorAction} className="grid gap-3 border-b hairline p-4 sm:grid-cols-3" submitLabel="Save colour">
              <input type="hidden" name="productId" value={productId} /><input type="hidden" name="id" value={c.id} />
              <AInput name="name" label="Name" defaultValue={c.name} />
              <AInput name="hex" label="Swatch hex" defaultValue={c.hex} />
            </ActionForm>
          )}
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-stone"><tr><th className="px-4 py-2">Size</th><th className="px-2">SKU</th><th className="px-2">Price override (₹)</th><th className="px-2">Active</th><th className="px-2">On hand / reserved</th><th /></tr></thead>
            <tbody className="divide-y hairline">
              {variants.filter((v) => v.colorId === c.id).map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 font-medium">{v.size}</td>
                  <td colSpan={4} className="px-2 py-2">
                    <VariantRowForm className="grid grid-cols-[1.4fr_1fr_auto_1fr_auto] items-center gap-2">
                      <input type="hidden" name="id" value={v.id} />
                      <input name="sku" defaultValue={v.sku} aria-label={`SKU for ${v.size}`} className="h-9 border hairline bg-white/60 px-2 font-mono text-xs" />
                      <input name="priceOverride" defaultValue={v.priceOverride != null ? paiseToRupeesString(v.priceOverride) : ""} placeholder="—" aria-label="Price override" className="h-9 border hairline bg-white/60 px-2" />
                      <input type="checkbox" name="isActive" defaultChecked={v.isActive} aria-label="Active" className="accent-forest" />
                      <span className="tabular-nums text-stone">{v.onHand} / {v.reserved}</span>
                      <button className="label border hairline px-2 py-1.5 hover:border-forest">Save</button>
                    </VariantRowForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ActionForm action={generateVariantsAction} className="flex flex-wrap items-end gap-3 border-t hairline p-4" submitLabel="Add sizes" submitVariant="outline">
            <input type="hidden" name="productId" value={productId} /><input type="hidden" name="colorId" value={c.id} />
            <AInput name="sizes" label="Add sizes (comma separated)" placeholder="S, M, L, XL, XXL" className="w-72" />
          </ActionForm>
        </div>
      ))}
      <ActionForm action={saveColorAction} className="grid gap-3 border border-dashed hairline p-4 sm:grid-cols-3" submitLabel="Add colour" submitVariant="outline">
        <input type="hidden" name="productId" value={productId} />
        <AInput name="name" label="New colour name" placeholder="Forest Green" />
        <AInput name="hex" label="Swatch hex" placeholder="#173A2C" />
      </ActionForm>
      <p className="text-xs text-stone">Stock levels are changed from Inventory so every change is recorded in the audit history.</p>
    </div>
  );
}

export function ImagesPanel({ productId, images, colors }: { productId: string; images: Img[]; colors: Color[] }) {
  return (
    <div className="space-y-6">
      <ActionForm action={uploadProductImagesAction} className="grid gap-3 border border-dashed hairline p-4 sm:grid-cols-2" submitLabel="Upload images" submitVariant="outline">
        <input type="hidden" name="productId" value={productId} />
        <label className="text-[13px] font-medium sm:col-span-2">Images (JPEG/PNG/WebP/AVIF, up to 12 MB each)
          <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="mt-1 block text-sm" />
        </label>
        <AInput name="alt" label="Alt text (applied to all; edit individually after)" placeholder="Eclipse hoodie in forest green, back view" />
        <ASelect name="colorId" label="Colour" optional defaultValue=""><option value="">All colours</option>{colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</ASelect>
        <ASelect name="kind" label="View" defaultValue="OTHER">{KINDS.map((k) => <option key={k}>{k}</option>)}</ASelect>
        <ACheckbox name="isConcept" label="Concept render (not a photograph of the produced garment)" />
      </ActionForm>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((im, i) => (
          <li key={im.id} className="border hairline bg-ivory">
            <div className="relative aspect-[4/5] bg-cream">
              <Image src={im.url} alt={im.alt} fill sizes="300px" className="object-cover" />
              <span className="absolute left-2 top-2 bg-obsidian/70 px-2 py-0.5 text-[10px] text-ivory">#{i + 1}{im.isConcept && " · concept"}</span>
            </div>
            <ActionForm action={updateImageAction} className="space-y-2 p-3 text-xs" submitLabel="Save" submitVariant="outline" toast extraButtons={
              <>
                <ActionButton size="sm" variant="ghost" action={() => moveImageAction(im.id, -1)} disabled={i === 0}>↑</ActionButton>
                <ActionButton size="sm" variant="ghost" action={() => moveImageAction(im.id, 1)} disabled={i === images.length - 1}>↓</ActionButton>
                <ActionButton size="sm" variant="ghost" confirm="Delete this image?" action={() => deleteImageAction(im.id)}>Delete</ActionButton>
              </>
            }>
              <input type="hidden" name="id" value={im.id} />
              <AInput name="alt" label="Alt text" defaultValue={im.alt} />
              <div className="grid grid-cols-2 gap-2">
                <ASelect name="colorId" label="Colour" defaultValue={im.colorId ?? ""}><option value="">All</option>{colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</ASelect>
                <ASelect name="kind" label="View" defaultValue={im.kind}>{KINDS.map((k) => <option key={k}>{k}</option>)}</ASelect>
              </div>
              <ACheckbox name="isConcept" label="Concept render" defaultChecked={im.isConcept} />
            </ActionForm>
          </li>
        ))}
      </ul>
      {images.length === 0 && <p className="text-sm text-stone">No images yet.</p>}
      <p className="text-xs text-stone">Uploads are validated, resized and re-encoded (metadata stripped). The first image is the primary listing image; the second appears on hover.</p>
    </div>
  );
}

/** Inline variant editor row: keeps typed values and reports the result (errors used to be silently dropped). */
function VariantRowForm({ className, children }: { className: string; children: ReactNode }) {
  const [pending, start] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  return (
    <form
      className={className}
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await updateVariantAction(null, fd);
          if (r.ok) {
            push("success", "Variant saved.");
            router.refresh();
          } else push("error", r.error.message);
        });
      }}
    >
      {children}
    </form>
  );
}
