"use client";

import { cn } from "@/lib/utils";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { AInput, ASelect, ATextarea, ACheckbox } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MediaField } from "./client";
import { saveCollectionAction, setCollectionProductsAction } from "@/server/actions/admin/catalog";

type Data = { id: string; title: string; slug: string; eyebrow: string; description: string; content: string; heroImageUrl: string; mobileImageUrl: string; imageAlt: string; type: "MANUAL" | "RULE"; linkType: "PRODUCTS" | "EDITORIAL"; editorialHref: string; ruleCategories: string; ruleTags: string; sortOrder: string; showInExplore: boolean; seoTitle: string; seoDescription: string };

export function CollectionForm({ data, categories }: { data: Data | null; categories: { slug: string; name: string }[] }) {
  const [type, setType] = useState(data?.type ?? "MANUAL");
  const [link, setLink] = useState(data?.linkType ?? "PRODUCTS");
  return (
    <ActionForm action={saveCollectionAction} className="grid gap-4 sm:grid-cols-2" submitLabel="Save collection">
      {data && <input type="hidden" name="id" value={data.id} />}
      <AInput name="title" label="Title" defaultValue={data?.title} required />
      <AInput name="slug" label="URL slug" defaultValue={data?.slug} hint="Leave blank to generate." />
      <AInput name="eyebrow" label="Eyebrow label" optional defaultValue={data?.eyebrow} />
      <AInput name="sortOrder" label="Sort order" type="number" defaultValue={data?.sortOrder ?? "0"} />
      <ATextarea name="description" label="Description" optional defaultValue={data?.description} className="sm:col-span-2" rows={2} />
      <ATextarea name="content" label="Page content" optional defaultValue={data?.content} className="sm:col-span-2" rows={6} hint="Shown below the products. Markdown: ## headings, **bold**, - lists, [links](/size-guide). Write for shoppers: fit, fabric, care, who it&apos;s for. Only verified facts." />
      <MediaField name="heroImageUrl" label="Tile / hero image" defaultValue={data?.heroImageUrl} folder="collections" />
      <MediaField name="mobileImageUrl" label="Mobile image (optional)" defaultValue={data?.mobileImageUrl} folder="collections" />
      <AInput name="imageAlt" label="Image alt text" defaultValue={data?.imageAlt} className="sm:col-span-2" />
      <ASelect name="linkType" label="Links to" value={link} onChange={(e) => setLink(e.target.value as "PRODUCTS")}><option value="PRODUCTS">Product listing</option><option value="EDITORIAL">Editorial page</option></ASelect>
      {link === "EDITORIAL" ? <AInput name="editorialHref" label="Editorial path" defaultValue={data?.editorialHref} placeholder="/lookbook" /> : (
        <ASelect name="type" label="Products" value={type} onChange={(e) => setType(e.target.value as "MANUAL")}><option value="MANUAL">Chosen manually</option><option value="RULE">Rule-based (category/tags)</option></ASelect>
      )}
      {link === "PRODUCTS" && type === "RULE" && (
        <>
          <AInput name="ruleCategories" label={`Category slugs (${categories.map((c) => c.slug).join(", ")})`} defaultValue={data?.ruleCategories} />
          <AInput name="ruleTags" label="Tags (any match)" defaultValue={data?.ruleTags} />
        </>
      )}
      <ACheckbox name="showInExplore" label="Show on Collections page" defaultChecked={data?.showInExplore ?? true} />
      <AInput name="seoTitle" label="SEO title" optional defaultValue={data?.seoTitle} />
      <AInput name="seoDescription" label="Meta description" optional defaultValue={data?.seoDescription} />
    </ActionForm>
  );
}

export function CollectionProducts({ collectionId, selected, products }: { collectionId: string; selected: string[]; products: { id: string; name: string; status: string }[] }) {
  const [ids, setIds] = useState(selected);
  const [pending, start] = useTransition();
  const { push } = useToast();
  const router = useRouter();
  const move = (i: number, d: number) => setIds((x) => { const y = [...x]; const j = i + d; if (j < 0 || j >= y.length) return y; [y[i], y[j]] = [y[j]!, y[i]!]; return y; });
  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-1">
        {ids.map((id, i) => { const p = products.find((x) => x.id === id); return (
          <li key={id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-charcoal/[0.08]">
            <span className="min-w-0 truncate"><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-cream text-xs tabular-nums text-charcoal/70">{i + 1}</span>{p?.name}{p?.status !== "ACTIVE" && <span className="text-xs text-stone"> ({p?.status.toLowerCase()})</span>}</span>
            <span className="flex shrink-0 gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p?.name ?? "product"} up`} className={REORDER_BTN}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label={`Move ${p?.name ?? "product"} down`} className={REORDER_BTN}>↓</button>
              <button type="button" onClick={() => setIds((x) => x.filter((y) => y !== id))} aria-label={`Remove ${p?.name ?? "product"}`} className={cn(REORDER_BTN, "text-danger hover:bg-danger/10")}>×</button>
            </span>
          </li>
        ); })}
      </ol>
      <select className="h-10 w-full border hairline bg-white/60 px-2" value="" onChange={(e) => e.target.value && setIds((x) => [...x, e.target.value])} aria-label="Add product">
        <option value="">Add a product…</option>
        {products.filter((p) => !ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <Button type="button" loading={pending} onClick={() => start(async () => { const r = await setCollectionProductsAction(collectionId, ids); push(r.ok ? "success" : "error", r.ok ? "Products saved." : r.error.message); router.refresh(); })}>Save order</Button>
    </div>
  );
}

const REORDER_BTN = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-charcoal/70 hover:bg-cream hover:text-obsidian disabled:pointer-events-none disabled:opacity-30";
