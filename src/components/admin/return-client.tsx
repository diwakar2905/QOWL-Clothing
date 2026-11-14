"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ATextarea, ASelect } from "@/components/ui/fields";
import { uuid } from "@/lib/client-api";
import { RETURN_TRANSITIONS, humanise } from "@/domain/state-machines";
import { returnTransitionAction, inspectReturnAction, refundReturnAction, shipExchangeAction } from "@/server/actions/admin/operations";
import type { ReturnStatus } from "@/generated/prisma/enums";

const MANUAL: ReturnStatus[] = ["APPROVED", "REJECTED", "PICKUP_SCHEDULED", "IN_TRANSIT", "RECEIVED", "CANCELLED"];

export function ReturnActions({ returnId, status, canReceive }: { returnId: string; status: ReturnStatus; canReceive: boolean }) {
  const options = RETURN_TRANSITIONS[status].filter((s) => MANUAL.includes(s) && (s !== "RECEIVED" || canReceive));
  const [to, setTo] = useState<string>(options[0] ?? "");
  if (!options.length) return <p className="text-sm text-stone">No manual workflow steps from {humanise(status)}.</p>;
  return (
    <ActionForm action={returnTransitionAction} className="grid gap-3 sm:grid-cols-2" submitLabel="Update">
      <input type="hidden" name="returnId" value={returnId} />
      <ASelect name="to" label="Move to" value={to} onChange={(e) => setTo(e.target.value)}>{options.map((o) => <option key={o} value={o}>{humanise(o)}</option>)}</ASelect>
      {to === "PICKUP_SCHEDULED" && <AInput name="pickupAt" label="Pickup date/time (IST)" type="datetime-local" />}
      {to === "REJECTED" && <ATextarea name="rejectionReason" label="Reason (sent to customer)" required className="sm:col-span-2" />}
      <AInput name="note" label="Note (sent to customer for approvals)" optional className="sm:col-span-2" />
      {to === "RECEIVED" && <p className="text-xs text-stone sm:col-span-2">Received units go into quarantine (not sellable) until inspected.</p>}
    </ActionForm>
  );
}

export function InspectForm({ returnId, items }: { returnId: string; items: { id: string; label: string; quantity: number }[] }) {
  return (
    <ActionForm action={inspectReturnAction} submitLabel="Record inspection" className="space-y-4">
      <input type="hidden" name="returnId" value={returnId} />
      {items.map((i) => (
        <fieldset key={i.id} className="grid gap-3 border hairline p-3 sm:grid-cols-4">
          <input type="hidden" name="returnItemId" value={i.id} />
          <legend className="px-1 text-sm font-medium">{i.label} ({i.quantity} received)</legend>
          <AInput name={`restock_${i.id}`} label="Restock (sellable)" type="number" min={0} max={i.quantity} defaultValue={String(i.quantity)} />
          <AInput name={`damaged_${i.id}`} label="Damaged" type="number" min={0} max={i.quantity} defaultValue="0" />
          <AInput name={`note_${i.id}`} label="Condition note" optional className="sm:col-span-2" />
        </fieldset>
      ))}
      <p className="text-xs text-stone">Restocked + damaged must equal the received quantity for each item.</p>
    </ActionForm>
  );
}

export function RefundReturnForm({ returnId, suggested, cod }: { returnId: string; suggested: string; cod: boolean }) {
  const [key] = useState(() => uuid());
  return (
    <ActionForm action={refundReturnAction} className="grid gap-3 sm:grid-cols-2" submitLabel="Issue refund" confirm="Issue this refund?">
      <input type="hidden" name="returnId" value={returnId} /><input type="hidden" name="idempotencyKey" value={key} />
      <AInput name="amount" label="Amount (₹)" defaultValue={suggested} inputMode="decimal" />
      <ASelect name="method" label="Method" defaultValue={cod ? "MANUAL" : "GATEWAY"}>{!cod && <option value="GATEWAY">Original payment method</option>}<option value="MANUAL">Manual (enter reference)</option></ASelect>
      <AInput name="manualReference" label="Manual reference" optional />
    </ActionForm>
  );
}

export function ShipExchangeForm({ returnId }: { returnId: string }) {
  return (
    <ActionForm action={shipExchangeAction} className="grid gap-3 sm:grid-cols-3" submitLabel="Ship replacement">
      <input type="hidden" name="returnId" value={returnId} />
      <AInput name="courierName" label="Courier" required />
      <AInput name="awb" label="AWB" required />
      <AInput name="trackingUrl" label="Tracking link" optional />
    </ActionForm>
  );
}
