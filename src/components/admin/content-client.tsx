"use client";

import { ActionForm } from "@/components/ui/action-form";
import { AInput, ATextarea, ASelect, ACheckbox } from "@/components/ui/fields";
import { Card } from "./ui";
import { ActionButton, MediaField } from "./client";
import { saveSectionAction, moveSectionAction, toggleSectionAction, saveHeroSlideAction, deleteHeroSlideAction, saveAnnouncementAction, deleteAnnouncementAction, saveLookbookImageAction, deleteLookbookImageAction, savePageAction } from "@/server/actions/admin/content";

export function SectionsEditor({ sections }: { sections: { id: string; type: string; label: string; isVisible: boolean; data: string }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone">Section content is edited as structured JSON validated against each section&apos;s schema (invalid fields are rejected). Images: upload under Lookbook/Hero, or paste paths. Craft items only appear when <code>&quot;approved&quot;: true</code>.</p>
      {sections.map((s, i) => (
        <details key={s.id} className="border hairline bg-white/40">
          <summary className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span><strong>{s.label}</strong> <span className="text-stone">· {s.type}</span>{!s.isVisible && <span className="ml-2 text-warning">hidden</span>}</span>
            <span className="flex gap-1" onClick={(e) => e.preventDefault()}>
              <ActionButton size="sm" variant="ghost" disabled={i === 0} action={() => moveSectionAction(s.id, -1)}>↑</ActionButton>
              <ActionButton size="sm" variant="ghost" disabled={i === sections.length - 1} action={() => moveSectionAction(s.id, 1)}>↓</ActionButton>
              <ActionButton size="sm" variant="ghost" action={() => toggleSectionAction(s.id, !s.isVisible)}>{s.isVisible ? "Hide" : "Show"}</ActionButton>
            </span>
          </summary>
          <ActionForm action={saveSectionAction} className="space-y-3 border-t hairline p-4">
            <input type="hidden" name="id" value={s.id} />
            <AInput name="label" label="Admin label" defaultValue={s.label} />
            <ATextarea name="data" label="Content (JSON)" defaultValue={s.data} rows={Math.min(24, s.data.split("\n").length + 1)} className="font-mono text-xs" />
            <ACheckbox name="isVisible" label="Visible" defaultChecked={s.isVisible} />
          </ActionForm>
        </details>
      ))}
    </div>
  );
}

type Slide = { id: string; eyebrow: string | null; heading: string; subheading: string | null; desktopImageUrl: string; mobileImageUrl: string | null; imageAlt: string; isConcept: boolean; primaryLabel: string | null; primaryHref: string | null; secondaryLabel: string | null; secondaryHref: string | null; sideLabels: string[]; sortOrder: number; isActive: boolean; startsAt: string; endsAt: string };

function SlideForm({ s }: { s?: Slide }) {
  return (
    <ActionForm action={saveHeroSlideAction} className="grid gap-4 sm:grid-cols-2" submitLabel={s ? "Save slide" : "Add slide"} extraButtons={s && <ActionButton variant="danger" confirm="Delete slide?" action={() => deleteHeroSlideAction(s.id)}>Delete</ActionButton>}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <MediaField name="desktopImageUrl" label="Desktop image" defaultValue={s?.desktopImageUrl} />
      <MediaField name="mobileImageUrl" label="Mobile image (optional)" defaultValue={s?.mobileImageUrl} />
      <AInput name="imageAlt" label="Image alt text" defaultValue={s?.imageAlt} required className="sm:col-span-2" />
      <AInput name="eyebrow" label="Eyebrow" optional defaultValue={s?.eyebrow ?? ""} />
      <AInput name="heading" label="Heading" defaultValue={s?.heading} required />
      <AInput name="subheading" label="Subheading" optional defaultValue={s?.subheading ?? ""} />
      <AInput name="sideLabels" label="Side labels (comma separated)" optional defaultValue={s?.sideLabels.join(", ")} />
      <AInput name="primaryLabel" label="Primary button" optional defaultValue={s?.primaryLabel ?? ""} />
      <AInput name="primaryHref" label="Primary link" optional defaultValue={s?.primaryHref ?? ""} />
      <AInput name="secondaryLabel" label="Secondary button" optional defaultValue={s?.secondaryLabel ?? ""} />
      <AInput name="secondaryHref" label="Secondary link" optional defaultValue={s?.secondaryHref ?? ""} />
      <AInput name="startsAt" label="Show from (IST)" optional type="datetime-local" defaultValue={s?.startsAt} />
      <AInput name="endsAt" label="Show until (IST)" optional type="datetime-local" defaultValue={s?.endsAt} />
      <AInput name="sortOrder" label="Order" type="number" defaultValue={String(s?.sortOrder ?? 0)} />
      <div className="flex flex-col justify-end gap-2"><ACheckbox name="isActive" label="Active" defaultChecked={s?.isActive ?? true} /><ACheckbox name="isConcept" label="Concept imagery (shows disclosure badge)" defaultChecked={s?.isConcept} /></div>
    </ActionForm>
  );
}

export function HeroSlides({ slides }: { slides: Slide[] }) {
  return <div className="space-y-4">{slides.map((s) => <Card key={s.id} title={s.heading}><SlideForm s={s} /></Card>)}<Card title="New slide"><SlideForm /></Card></div>;
}

type Ann = { id: string; message: string; href: string; isActive: boolean; startsAt: string; endsAt: string; sortOrder: number };
function AnnForm({ a }: { a?: Ann }) {
  return (
    <ActionForm action={saveAnnouncementAction} className="grid gap-3 sm:grid-cols-3" submitLabel={a ? "Save" : "Add"} extraButtons={a && <ActionButton variant="danger" action={() => deleteAnnouncementAction(a.id)}>Delete</ActionButton>}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <AInput name="message" label="Message" defaultValue={a?.message} required className="sm:col-span-2" />
      <AInput name="href" label="Link" optional defaultValue={a?.href} />
      <AInput name="startsAt" label="From (IST)" optional type="datetime-local" defaultValue={a?.startsAt} />
      <AInput name="endsAt" label="Until (IST)" optional type="datetime-local" defaultValue={a?.endsAt} />
      <AInput name="sortOrder" label="Order" type="number" defaultValue={String(a?.sortOrder ?? 0)} />
      <ACheckbox name="isActive" label="Enabled" defaultChecked={a?.isActive ?? true} />
    </ActionForm>
  );
}
export function Announcements({ items }: { items: Ann[] }) {
  return <div className="space-y-4"><p className="text-xs text-stone">Don&apos;t advertise offers or shipping promises that aren&apos;t configured in Settings.</p>{items.map((a) => <Card key={a.id}><AnnForm a={a} /></Card>)}<Card title="New announcement"><AnnForm /></Card></div>;
}

type Look = { id: string; imageUrl: string; alt: string; caption: string; productId: string; isConcept: boolean; sortOrder: number; isActive: boolean };
function LookForm({ l, products }: { l?: Look; products: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveLookbookImageAction} className="grid gap-3 sm:grid-cols-2" submitLabel={l ? "Save" : "Add image"} extraButtons={l && <ActionButton variant="danger" action={() => deleteLookbookImageAction(l.id)}>Delete</ActionButton>}>
      {l && <input type="hidden" name="id" value={l.id} />}
      <MediaField name="imageUrl" label="Image" defaultValue={l?.imageUrl} />
      <div className="space-y-3">
        <AInput name="alt" label="Alt text" defaultValue={l?.alt} required />
        <AInput name="caption" label="Caption" optional defaultValue={l?.caption} />
        <ASelect name="productId" label="Linked product" optional defaultValue={l?.productId ?? ""}><option value="">None</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</ASelect>
        <AInput name="sortOrder" label="Order" type="number" defaultValue={String(l?.sortOrder ?? 0)} />
        <ACheckbox name="isActive" label="Visible" defaultChecked={l?.isActive ?? true} />
        <ACheckbox name="isConcept" label="Concept imagery" defaultChecked={l?.isConcept} />
      </div>
    </ActionForm>
  );
}
export function Lookbook({ images, products }: { images: Look[]; products: { id: string; name: string }[] }) {
  return <div className="space-y-4">{images.map((l) => <Card key={l.id}><LookForm l={l} products={products} /></Card>)}<Card title="Add image"><LookForm products={products} /></Card></div>;
}

type Pg = { id: string; slug: string; title: string; body: string; status: string; showInFooter: boolean; footerGroup: string; sortOrder: number; seoDescription: string };
function PageForm({ p }: { p?: Pg }) {
  return (
    <ActionForm action={savePageAction} className="grid gap-3 sm:grid-cols-3" submitLabel={p ? "Save page" : "Create page"}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <AInput name="title" label="Title" defaultValue={p?.title} required />
      <AInput name="slug" label="Slug" defaultValue={p?.slug} />
      <ASelect name="status" label="Status" defaultValue={p?.status ?? "DRAFT"}><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></ASelect>
      <ATextarea name="body" label="Content (Markdown: ## headings, - lists, **bold**, [links](/path))" defaultValue={p?.body} rows={12} className="font-mono text-xs sm:col-span-3" />
      <ASelect name="footerGroup" label="Footer group" defaultValue={p?.footerGroup ?? "help"}><option value="help">Help</option><option value="legal">Legal</option></ASelect>
      <AInput name="sortOrder" label="Order" type="number" defaultValue={String(p?.sortOrder ?? 0)} />
      <AInput name="seoDescription" label="Meta description" optional defaultValue={p?.seoDescription} />
      <ACheckbox name="showInFooter" label="Show in footer" defaultChecked={p?.showInFooter ?? true} />
    </ActionForm>
  );
}
export function Pages({ pages }: { pages: Pg[] }) {
  return <div className="space-y-4"><p className="text-xs text-stone">Policy pages should be reviewed by legal counsel before publishing. Publishing requires Settings permission.</p>{pages.map((p) => <details key={p.id} className="border hairline bg-ivory"><summary className="px-4 py-3 text-sm"><strong>{p.title}</strong> · /pages/{p.slug} · {p.status}</summary><div className="border-t hairline p-4"><PageForm p={p} /></div></details>)}<Card title="New page"><PageForm /></Card></div>;
}
