"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ASelect } from "@/components/ui/fields";
import { adjustStockAction, importStockCsvAction } from "@/server/actions/admin/operations";

export function AdjustStock({ variantId, label, threshold }: { variantId: string; label: string; threshold: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="label text-forest" onClick={() => setOpen(true)}>Adjust</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Adjust stock — ${label}`}>
        <ActionForm action={async (p, f) => { const r = await adjustStockAction(p, f); if (r.ok) setOpen(false); return r; }} className="grid gap-4 p-6 sm:grid-cols-2" submitLabel="Apply">
          <input type="hidden" name="variantId" value={variantId} />
          <ASelect name="type" label="Type" defaultValue="RESTOCK">
            <option value="RESTOCK">Restock (+ add received units)</option>
            <option value="ADJUSTMENT">Adjustment (+/− units)</option>
            <option value="CORRECTION">Stock count (set on-hand to)</option>
            <option value="DAMAGED">Mark damaged (move out of sellable)</option>
          </ASelect>
          <AInput name="quantity" label="Quantity" type="number" required />
          <AInput name="reason" label="Reason" required placeholder="Production batch #12 received" className="sm:col-span-2" />
          <AInput name="note" label="Note" optional className="sm:col-span-2" />
          <AInput name="lowStockThreshold" label="Low-stock threshold" type="number" defaultValue={String(threshold)} />
        </ActionForm>
      </Dialog>
    </>
  );
}

export function ImportCsv() {
  return (
    <ActionForm action={importStockCsvAction} submitLabel="Import" submitVariant="outline" className="flex flex-wrap items-end gap-4 text-sm" confirm="Apply this stock import? All rows are applied together or not at all.">
      <label className="text-[13px] font-medium">CSV file
        <input type="file" name="file" accept=".csv,text/csv" className="mt-1 block" />
      </label>
      <p className="max-w-md text-xs text-stone">Header: <code>sku,mode,quantity,reason</code>. <code>mode</code> is <code>add</code> (restock) or <code>set</code> (physical count). Rows are validated first; nothing is applied if any row is invalid.</p>
    </ActionForm>
  );
}
