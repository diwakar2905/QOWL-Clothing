"use client";

import { ActionForm } from "@/components/ui/action-form";
import { AInput, ASelect, ACheckbox } from "@/components/ui/fields";
import { saveStaffAction, saveRoleAction } from "@/server/actions/admin/content";

export function StaffForm({ roles, s }: { roles: { id: string; name: string }[]; s?: { id: string; name: string; roleId: string; disabled: boolean } }) {
  return (
    <ActionForm action={saveStaffAction} className="grid gap-3 sm:grid-cols-2" submitLabel={s ? "Save" : "Add staff"}>
      {s && <input type="hidden" name="id" value={s.id} />}
      {!s && <AInput name="email" label="Email" type="email" required />}
      {!s && <AInput name="password" label="Temporary password" type="password" hint="Share securely; ask them to change it." required />}
      <AInput name="name" label="Name" defaultValue={s?.name} />
      <ASelect name="roleId" label="Role" defaultValue={s?.roleId ?? ""}><option value="">{s ? "Remove staff access" : "Choose…"}</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</ASelect>
      {s && <ACheckbox name="disabled" label="Disable account" defaultChecked={s.disabled} />}
    </ActionForm>
  );
}

export function RoleForm({ permissions, r }: { permissions: Record<string, string>; r?: { id: string; name: string; description: string; permissions: string[]; locked: boolean } }) {
  if (r?.locked) return <p className="text-sm text-stone">Super Admin always has every permission.</p>;
  return (
    <ActionForm action={saveRoleAction} className="space-y-3" submitLabel={r ? "Save role" : "Create role"}>
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="grid gap-3 sm:grid-cols-2"><AInput name="name" label="Name" defaultValue={r?.name} /><AInput name="description" label="Description" optional defaultValue={r?.description} /></div>
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        {Object.entries(permissions).map(([k, d]) => <label key={k} className="flex items-start gap-2"><input type="checkbox" name="permissions" value={k} defaultChecked={r?.permissions.includes(k)} className="mt-1 accent-forest" /><span><code className="text-xs">{k}</code> <span className="text-stone">— {d}</span></span></label>)}
      </div>
    </ActionForm>
  );
}
