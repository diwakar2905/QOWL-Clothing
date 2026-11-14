"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ASelect, ACheckbox } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { INDIAN_STATES } from "@/lib/validation";
import { saveAddressAction, deleteAddressAction } from "@/server/actions/account";

type A = { id: string; fullName: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; isDefault: boolean };

function AddressForm({ a, onDone }: { a?: A; onDone: () => void }) {
  return (
    <ActionForm action={async (p, f) => { const r = await saveAddressAction(p, f); if (r.ok) onDone(); return r; }} className="grid gap-4 border hairline p-5 sm:grid-cols-2" submitLabel="Save address">
      {a && <input type="hidden" name="id" value={a.id} />}
      <AInput name="fullName" label="Full name" defaultValue={a?.fullName} required className="sm:col-span-2" />
      <AInput name="phone" label="Mobile number" defaultValue={a?.phone} required />
      <AInput name="pincode" label="PIN code" defaultValue={a?.pincode} inputMode="numeric" maxLength={6} required />
      <AInput name="line1" label="Address line 1" defaultValue={a?.line1} required className="sm:col-span-2" />
      <AInput name="line2" label="Address line 2" optional defaultValue={a?.line2} className="sm:col-span-2" />
      <AInput name="landmark" label="Landmark" optional defaultValue={a?.landmark} />
      <AInput name="city" label="City" defaultValue={a?.city} required />
      <ASelect name="state" label="State" defaultValue={a?.state ?? ""} required>
        <option value="" disabled>Select state</option>
        {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
      </ASelect>
      <ACheckbox name="isDefault" defaultChecked={a?.isDefault} label="Set as default address" className="self-end sm:col-span-2" />
    </ActionForm>
  );
}

export function AddressManager({ addresses }: { addresses: A[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(addresses.length ? null : "new");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h2 className="label-wide">Saved addresses</h2>{editing !== "new" && addresses.length < 10 && <Button size="sm" variant="outline" onClick={() => setEditing("new")}>Add address</Button>}</div>
      {editing === "new" && <AddressForm onDone={() => setEditing(null)} />}
      <ul className="grid gap-4 sm:grid-cols-2">
        {addresses.map((a) =>
          editing === a.id ? (
            <li key={a.id} className="sm:col-span-2"><AddressForm a={a} onDone={() => setEditing(null)} /></li>
          ) : (
            <li key={a.id} className="border hairline p-5 text-sm">
              <p className="flex items-center gap-2 font-medium">{a.fullName}{a.isDefault && <Badge tone="forest">Default</Badge>}</p>
              <p className="mt-1 leading-relaxed text-charcoal/80">{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.landmark && <>{a.landmark}<br /></>}{a.city}, {a.state} {a.pincode}<br />{a.phone}</p>
              <div className="mt-3 flex gap-4">
                <button type="button" className="label link-underline" onClick={() => setEditing(a.id)}>Edit</button>
                <button type="button" className="label link-underline text-danger" disabled={pending} onClick={() => { if (confirm("Delete this address?")) start(async () => { await deleteAddressAction(a.id); router.refresh(); }); }}>Delete</button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
