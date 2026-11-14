"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ASelect, ACheckbox } from "@/components/ui/fields";
import { saveCouponAction } from "@/server/actions/admin/operations";

type Data = { id: string; code: string; description: string; type: "PERCENT" | "FIXED"; value: string; minCartValue: string; maxDiscount: string; startsAt: string; endsAt: string; usageLimit: string; perCustomerLimit: string; firstOrderOnly: boolean; scope: "ALL" | "PRODUCTS" | "COLLECTIONS"; isActive: boolean; productIds: string[]; collectionIds: string[] };

export function CouponForm({ data, products, collections }: { data: Data | null; products: { id: string; name: string }[]; collections: { id: string; title: string }[] }) {
  const [type, setType] = useState(data?.type ?? "PERCENT");
  const [scope, setScope] = useState(data?.scope ?? "ALL");
  return (
    <ActionForm action={saveCouponAction} className="grid gap-4 sm:grid-cols-3" submitLabel={data ? "Save changes" : "Create code"}>
      {data && <input type="hidden" name="id" value={data.id} />}
      <AInput name="code" label="Code" defaultValue={data?.code} required placeholder="DROP001" />
      <ASelect name="type" label="Type" value={type} onChange={(e) => setType(e.target.value as "PERCENT")}><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount (₹)</option></ASelect>
      <AInput name="value" label={type === "PERCENT" ? "Percent off (1–90)" : "Amount off (₹)"} defaultValue={data?.value} required inputMode="decimal" />
      <AInput name="minCartValue" label="Minimum bag value (₹)" optional defaultValue={data?.minCartValue} />
      <AInput name="maxDiscount" label="Maximum discount (₹)" optional defaultValue={data?.maxDiscount} />
      <AInput name="description" label="Internal description" optional defaultValue={data?.description} />
      <AInput name="startsAt" label="Starts (IST)" optional type="datetime-local" defaultValue={data?.startsAt} />
      <AInput name="endsAt" label="Ends (IST)" optional type="datetime-local" defaultValue={data?.endsAt} />
      <AInput name="usageLimit" label="Total uses" optional type="number" defaultValue={data?.usageLimit} />
      <AInput name="perCustomerLimit" label="Uses per customer" optional type="number" defaultValue={data?.perCustomerLimit} hint="1 = single use per customer (by email/account)." />
      <ASelect name="scope" label="Applies to" value={scope} onChange={(e) => setScope(e.target.value as "ALL")}><option value="ALL">Entire bag</option><option value="PRODUCTS">Specific products</option><option value="COLLECTIONS">Specific collections</option></ASelect>
      <div className="flex flex-col justify-end gap-2">
        <ACheckbox name="firstOrderOnly" label="First order only" defaultChecked={data?.firstOrderOnly} />
        <ACheckbox name="isActive" label="Active" defaultChecked={data?.isActive ?? true} />
      </div>
      {scope === "PRODUCTS" && <fieldset className="sm:col-span-3"><legend className="mb-2 text-[13px] font-medium">Products</legend><div className="grid gap-1 sm:grid-cols-3">{products.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="productIds" value={p.id} defaultChecked={data?.productIds.includes(p.id)} className="accent-forest" />{p.name}</label>)}</div></fieldset>}
      {scope === "COLLECTIONS" && <fieldset className="sm:col-span-3"><legend className="mb-2 text-[13px] font-medium">Collections</legend><div className="grid gap-1 sm:grid-cols-3">{collections.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="collectionIds" value={c.id} defaultChecked={data?.collectionIds.includes(c.id)} className="accent-forest" />{c.title}</label>)}</div></fieldset>}
    </ActionForm>
  );
}
