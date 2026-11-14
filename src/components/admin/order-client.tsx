"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ASelect, ATextarea, ACheckbox } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { uuid } from "@/lib/client-api";
import { cancelOrderAction, createShipmentAction, shipmentStatusAction, refundAction, addOrderNoteAction } from "@/server/actions/admin/operations";

function Modal({ label, title, children, variant = "outline" }: { label: string; title: string; children: (close: () => void) => React.ReactNode; variant?: "outline" | "primary" | "danger" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>{open && children(() => setOpen(false))}</Dialog>
    </>
  );
}

export function CancelOrder({ orderId, paid, cod }: { orderId: string; paid: boolean; cod: boolean }) {
  return (
    <Modal label="Cancel order" title="Cancel order" variant="danger">
      {(close) => (
        <ActionForm action={async (p, f) => { const r = await cancelOrderAction(p, f); if (r.ok) close(); return r; }} className="space-y-4 p-6" submitLabel="Cancel order" submitVariant="danger">
          <input type="hidden" name="orderId" value={orderId} />
          <ATextarea name="reason" label="Reason (shared with the customer)" required />
          {paid && <ACheckbox name="refund" defaultChecked label={cod ? "Record a full manual refund now" : "Issue a full refund to the original payment method now"} />}
          {paid && cod && <AInput name="manualReference" label="Manual refund reference (UTR / UPI ref)" optional />}
          <p className="text-xs text-stone">Committed stock is returned to sellable inventory automatically.</p>
        </ActionForm>
      )}
    </Modal>
  );
}

export function CreateShipment({ orderId, automation }: { orderId: string; automation: boolean }) {
  return (
    <Modal label="Create shipment" title="Create shipment" variant="primary">
      {(close) => (
        <div className="space-y-6 p-6">
          {automation && (
            <ActionForm action={async (p, f) => { const r = await createShipmentAction(p, f); if (r.ok) close(); return r; }} submitLabel="Book with shipping provider" className="border hairline p-4">
              <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="mode" value="provider" />
              <p className="text-sm">Creates the shipment, assigns an AWB and fetches a label via the configured provider.</p>
            </ActionForm>
          )}
          <ActionForm action={async (p, f) => { const r = await createShipmentAction(p, f); if (r.ok) close(); return r; }} submitLabel="Save manual shipment" className="grid gap-3 border hairline p-4 sm:grid-cols-2">
            <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="mode" value="manual" />
            <p className="text-sm sm:col-span-2">Manual fulfilment — enter the courier details you booked.</p>
            <AInput name="courierName" label="Courier" required />
            <AInput name="awb" label="AWB / tracking number" required />
            <AInput name="trackingUrl" label="Tracking link (https)" optional className="sm:col-span-2" />
          </ActionForm>
        </div>
      )}
    </Modal>
  );
}

export function ShipmentStatus({ orderId, shipmentId }: { orderId: string; shipmentId: string }) {
  return (
    <Modal label="Record status" title="Record shipment status">
      {(close) => (
        <ActionForm action={async (p, f) => { const r = await shipmentStatusAction(p, f); if (r.ok) close(); return r; }} className="space-y-4 p-6" submitLabel="Record">
          <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="shipmentId" value={shipmentId} />
          <ASelect name="status" label="Status" defaultValue="SHIPPED">
            {[["SHIPPED", "Picked up / shipped"], ["IN_TRANSIT", "In transit (note only)"], ["OUT_FOR_DELIVERY", "Out for delivery"], ["DELIVERED", "Delivered"], ["RTO_INITIATED", "Return to origin initiated"], ["RTO_DELIVERED", "RTO received at warehouse"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </ASelect>
          <AInput name="note" label="Note / location" optional />
        </ActionForm>
      )}
    </Modal>
  );
}

export function Refund({ orderId, max, cod }: { orderId: string; max: string; cod: boolean }) {
  const [key] = useState(() => uuid());
  return (
    <Modal label="Refund" title="Issue refund">
      {(close) => (
        <ActionForm action={async (p, f) => { const r = await refundAction(p, f); if (r.ok) close(); return r; }} className="grid gap-4 p-6 sm:grid-cols-2" submitLabel="Submit refund" confirm="Submit this refund? This cannot be undone.">
          <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="idempotencyKey" value={key} />
          <AInput name="amount" label={`Amount (₹, max ${max})`} defaultValue={max} required inputMode="decimal" />
          <ASelect name="method" label="Method" defaultValue={cod ? "MANUAL" : "GATEWAY"}>
            {!cod && <option value="GATEWAY">Original payment method (Razorpay)</option>}
            <option value="MANUAL">Manual (bank/UPI transfer — enter reference)</option>
          </ASelect>
          <AInput name="manualReference" label="Manual reference (UTR / UPI ref)" optional />
          <ATextarea name="reason" label="Reason" required className="sm:col-span-2" />
          <p className="text-xs text-stone sm:col-span-2">Gateway refunds are only counted as refunded once Razorpay confirms them (webhook or provider response).</p>
        </ActionForm>
      )}
    </Modal>
  );
}

export function OrderNote({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={addOrderNoteAction} submitLabel="Add note" submitVariant="outline" resetOnSuccess>
      <input type="hidden" name="orderId" value={orderId} />
      <ATextarea name="body" label="Internal note" rows={2} required />
    </ActionForm>
  );
}
