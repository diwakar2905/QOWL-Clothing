"use client";

import { ActionForm } from "@/components/ui/action-form";
import { ASelect, ATextarea } from "@/components/ui/fields";
import { updateCustomerAction } from "@/server/actions/admin/operations";

export function CustomerForm({ id, status, notes }: { id: string; status: string; notes: string }) {
  return (
    <ActionForm action={updateCustomerAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <ASelect name="status" label="Status" defaultValue={status}><option>ACTIVE</option><option>SUSPENDED</option><option>DELETION_REQUESTED</option></ASelect>
      <ATextarea name="supportNotes" label="Support notes (internal)" defaultValue={notes} rows={3} />
    </ActionForm>
  );
}
