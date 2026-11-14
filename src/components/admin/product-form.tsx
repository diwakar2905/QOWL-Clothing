"use client";

import { ActionForm } from "@/components/ui/action-form";
import { AInput, ATextarea, ASelect, ACheckbox } from "@/components/ui/fields";
import { createProductAction, updateProductAction } from "@/server/actions/admin/catalog";

export type ProductFormData = {
  id?: string; name: string; slug: string; styleCode: string; subtitle: string; description: string; story: string; categoryId: string; garmentType: string;
  price: string; mrp: string; salePrice: string; saleStartsAt: string; saleEndsAt: string; taxClassId: string;
  fabric: string; gsm: string; fit: string; careInstructions: string; countryOfOrigin: string; manufacturerInfo: string; marketerInfo: string; netQuantity: string; detailsApproved: boolean;
  sizeGuideId: string; tags: string; isFeatured: boolean; sortOrder: string; seoTitle: string; seoDescription: string;
};

export function ProductForm({ data, categories, taxClasses, sizeGuides }: { data: ProductFormData; categories: { id: string; name: string }[]; taxClasses: { id: string; name: string; reviewed: boolean }[]; sizeGuides: { id: string; name: string }[] }) {
  return (
    <ActionForm action={data.id ? updateProductAction : createProductAction} submitLabel={data.id ? "Save product" : "Create draft"} className="space-y-8">
      {data.id && <input type="hidden" name="id" value={data.id} />}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="label-wide mb-3">Basics</legend>
        <AInput name="name" label="Name" defaultValue={data.name} required />
        <AInput name="subtitle" label="Subtitle" optional defaultValue={data.subtitle} placeholder="The Statement Hoodie" />
        <AInput name="slug" label="URL slug" defaultValue={data.slug} hint="Leave blank to generate from the name." />
        <AInput name="styleCode" label="Style code (SKU base)" defaultValue={data.styleCode} required placeholder="QWL-HD-004" />
        <ASelect name="categoryId" label="Category" defaultValue={data.categoryId} required><option value="">Choose…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</ASelect>
        <AInput name="garmentType" label="Generic name / garment type" defaultValue={data.garmentType} required placeholder="Oversized T-shirt" />
        <ATextarea name="description" label="Description" defaultValue={data.description} className="sm:col-span-2" rows={4} required />
        <ATextarea name="story" label="Story (editorial section on product page)" optional defaultValue={data.story} className="sm:col-span-2" rows={3} />
        <AInput name="tags" label="Tags (comma separated)" optional defaultValue={data.tags} />
        <AInput name="sortOrder" label="Sort order" type="number" defaultValue={data.sortOrder} />
        <ACheckbox name="isFeatured" label="Featured on homepage grid" defaultChecked={data.isFeatured} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="label-wide mb-3">Pricing (₹, GST inclusive)</legend>
        <AInput name="price" label="Selling price" inputMode="decimal" defaultValue={data.price} required />
        <AInput name="mrp" label="MRP" inputMode="decimal" defaultValue={data.mrp} hint="Shown as 'MRP inclusive of all taxes'. Must be ≥ selling price." />
        <ASelect name="taxClassId" label="Tax class" defaultValue={data.taxClassId} required><option value="">Choose…</option>{taxClasses.map((t) => <option key={t.id} value={t.id}>{t.name}{t.reviewed ? "" : " (unreviewed)"}</option>)}</ASelect>
        <AInput name="salePrice" label="Sale price" optional inputMode="decimal" defaultValue={data.salePrice} />
        <AInput name="saleStartsAt" label="Sale starts (IST)" optional type="datetime-local" defaultValue={data.saleStartsAt} />
        <AInput name="saleEndsAt" label="Sale ends (IST)" optional type="datetime-local" defaultValue={data.saleEndsAt} />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="label-wide mb-1">Garment details &amp; disclosures</legend>
        <p className="text-xs text-stone sm:col-span-2">Only enter specifications confirmed for the produced garment. These appear on the product page and invoices.</p>
        <AInput name="fabric" label="Fabric / composition" optional defaultValue={data.fabric} />
        <AInput name="gsm" label="GSM" optional defaultValue={data.gsm} />
        <AInput name="fit" label="Fit" optional defaultValue={data.fit} />
        <AInput name="netQuantity" label="Net quantity" optional defaultValue={data.netQuantity} placeholder="1 N" />
        <ATextarea name="careInstructions" label="Care instructions" optional defaultValue={data.careInstructions} rows={2} />
        <AInput name="countryOfOrigin" label="Country of origin" optional defaultValue={data.countryOfOrigin} />
        <ATextarea name="manufacturerInfo" label="Manufactured by (name & address)" optional defaultValue={data.manufacturerInfo} rows={2} />
        <ATextarea name="marketerInfo" label="Marketed by (name & address)" optional defaultValue={data.marketerInfo} rows={2} />
        <ASelect name="sizeGuideId" label="Size guide" optional defaultValue={data.sizeGuideId}><option value="">None</option>{sizeGuides.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</ASelect>
        <ACheckbox name="detailsApproved" label="Specifications approved — details reflect the produced garment" defaultChecked={data.detailsApproved} className="self-end" />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="label-wide mb-3">SEO</legend>
        <AInput name="seoTitle" label="SEO title" optional defaultValue={data.seoTitle} maxLength={70} />
        <AInput name="seoDescription" label="Meta description" optional defaultValue={data.seoDescription} maxLength={170} />
      </fieldset>
    </ActionForm>
  );
}
