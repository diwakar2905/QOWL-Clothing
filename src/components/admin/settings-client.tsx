"use client";

import { ActionForm } from "@/components/ui/action-form";
import { AInput, ATextarea, ACheckbox, ASelect } from "@/components/ui/fields";
import { saveSettingsAction, saveTaxClassAction, saveEmailTemplateAction, saveSizeGuideAction } from "@/server/actions/admin/content";
import { INDIAN_STATES } from "@/lib/validation";

export type FieldSpec = { name: string; label: string; type: "text" | "textarea" | "bool" | "money" | "int" | "list" | "state" | "select"; hint?: string; options?: string[] };

/** Renders a settings group from a field spec; converts rupees→paise and lists before saving. */
export function SettingsGroup({ group, fields, values }: { group: string; fields: FieldSpec[]; values: Record<string, unknown> }) {
  const action = async (prev: Parameters<typeof saveSettingsAction>[0], fd: FormData) => {
    const out: Record<string, unknown> = { ...values };
    for (const f of fields) {
      const raw = String(fd.get(f.name) ?? "").trim();
      if (f.type === "bool") out[f.name] = fd.get(f.name) === "on";
      else if (f.type === "money") out[f.name] = raw === "" ? null : Math.round(Number(raw.replace(/,/g, "")) * 100);
      else if (f.type === "int") out[f.name] = raw === "" ? null : Number(raw);
      else if (f.type === "list") out[f.name] = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      else out[f.name] = raw;
    }
    const send = new FormData();
    send.set("key", group);
    send.set("value", JSON.stringify(out));
    return saveSettingsAction(prev, send);
  };
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.name];
        if (f.type === "bool") return <ACheckbox key={f.name} name={f.name} label={f.label} defaultChecked={!!v} className="sm:col-span-2" />;
        if (f.type === "textarea") return <ATextarea key={f.name} name={f.name} label={f.label} hint={f.hint} defaultValue={String(v ?? "")} rows={3} className="sm:col-span-2" />;
        if (f.type === "state") return <ASelect key={f.name} name={f.name} label={f.label} defaultValue={String(v ?? "")}><option value="">Not set</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</ASelect>;
        if (f.type === "select") return <ASelect key={f.name} name={f.name} label={f.label} defaultValue={String(v ?? "")}>{f.options!.map((o) => <option key={o}>{o}</option>)}</ASelect>;
        const dv = f.type === "money" ? (v == null ? "" : String((v as number) / 100)) : f.type === "list" ? ((v as string[]) ?? []).join(", ") : v == null ? "" : String(v);
        return <AInput key={f.name} name={f.name} label={f.label} hint={f.hint} defaultValue={dv} inputMode={f.type === "money" || f.type === "int" ? "decimal" : undefined} />;
      })}
    </ActionForm>
  );
}

export function TaxClassForm({ t }: { t?: { id: string; name: string; hsnCode: string; rateBps: number; upperRateBps: number | null; thresholdPaise: number | null; notes: string | null; reviewedAt: Date | null } }) {
  return (
    <ActionForm action={saveTaxClassAction} className="grid gap-3 sm:grid-cols-3" submitLabel={t ? "Save" : "Add tax class"}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <AInput name="name" label="Name" defaultValue={t?.name} />
      <AInput name="hsnCode" label="HSN code" defaultValue={t?.hsnCode} />
      <AInput name="rate" label="GST % (at/below threshold)" defaultValue={t ? String(t.rateBps / 100) : ""} />
      <AInput name="threshold" label="Per-piece threshold (₹)" optional defaultValue={t?.thresholdPaise != null ? String(t.thresholdPaise / 100) : ""} />
      <AInput name="upperRate" label="GST % above threshold" optional defaultValue={t?.upperRateBps != null ? String(t.upperRateBps / 100) : ""} />
      <ACheckbox name="reviewed" label="Reviewed by tax advisor" defaultChecked={!!t?.reviewedAt} className="self-end" />
      <ATextarea name="notes" label="Notes" optional defaultValue={t?.notes ?? ""} rows={2} className="sm:col-span-3" />
    </ActionForm>
  );
}

export function TemplateForm({ t }: { t: { key: string; name: string; subject: string; body: string; isActive: boolean } }) {
  return (
    <ActionForm action={saveEmailTemplateAction} className="space-y-3">
      <input type="hidden" name="key" value={t.key} />
      <AInput name="subject" label="Subject" defaultValue={t.subject} />
      <ATextarea name="body" label="Body ({{placeholders}} are filled automatically)" defaultValue={t.body} rows={6} />
      <ACheckbox name="isActive" label="Send this email" defaultChecked={t.isActive} />
    </ActionForm>
  );
}

export function SizeGuideForm({ g }: { g?: { id: string; name: string; unit: string; columns: string[]; rows: Record<string, string | number>[]; fitNotes: string | null; modelInfo: string | null; isApproved: boolean } }) {
  return (
    <ActionForm action={saveSizeGuideAction} className="grid gap-3 sm:grid-cols-3" submitLabel={g ? "Save" : "Add size guide"}>
      {g && <input type="hidden" name="id" value={g.id} />}
      <AInput name="name" label="Name" defaultValue={g?.name} />
      <ASelect name="unit" label="Unit" defaultValue={g?.unit ?? "in"}><option value="in">inches</option><option value="cm">cm</option></ASelect>
      <AInput name="columns" label="Columns" defaultValue={(g?.columns ?? ["chest", "length", "shoulder", "sleeve"]).join(", ")} />
      <ATextarea name="rows" label="Rows: size, then values in column order (one size per line)" defaultValue={g?.rows.map((r) => [r.size, ...g.columns.map((c) => r[c] ?? "")].join(", ")).join("\n") ?? "S, 44, 27.5, 21, 9"} rows={6} className="font-mono text-xs sm:col-span-3" />
      <AInput name="fitNotes" label="Fit guidance" optional defaultValue={g?.fitNotes ?? ""} className="sm:col-span-2" />
      <AInput name="modelInfo" label="Model info (only if genuine)" optional defaultValue={g?.modelInfo ?? ""} />
      <ACheckbox name="isApproved" label="Approved garment measurements (shown on storefront)" defaultChecked={g?.isApproved} className="sm:col-span-3" />
    </ActionForm>
  );
}
