"use client";

import { ActionForm } from "@/components/ui/action-form";
import { AInput, ACheckbox } from "@/components/ui/fields";
import { MediaField } from "./client";
import { saveCategoryAction } from "@/server/actions/admin/catalog";

type C = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; imageAlt: string | null; sortOrder: number; isActive: boolean; showOnHome: boolean; seoTitle: string | null; seoDescription: string | null };

export function CategoryForm({ data }: { data: C | null }) {
  return (
    <ActionForm action={saveCategoryAction} className="grid gap-4 sm:grid-cols-3" submitLabel={data ? "Save" : "Create category"}>
      {data && <input type="hidden" name="id" value={data.id} />}
      <AInput name="name" label="Name" defaultValue={data?.name} required />
      <AInput name="slug" label="Slug" defaultValue={data?.slug} />
      <AInput name="sortOrder" label="Sort order" type="number" defaultValue={String(data?.sortOrder ?? 0)} />
      <AInput name="description" label="Description" optional defaultValue={data?.description ?? ""} className="sm:col-span-2" />
      <AInput name="imageAlt" label="Image alt" optional defaultValue={data?.imageAlt ?? ""} />
      <MediaField name="imageUrl" label="Image" defaultValue={data?.imageUrl} />
      <AInput name="seoTitle" label="SEO title" optional defaultValue={data?.seoTitle ?? ""} />
      <AInput name="seoDescription" label="Meta description" optional defaultValue={data?.seoDescription ?? ""} />
      <ACheckbox name="isActive" label="Active (shown in navigation)" defaultChecked={data?.isActive ?? false} />
      <ACheckbox name="showOnHome" label="Suggested for homepage tiles" defaultChecked={data?.showOnHome ?? false} />
    </ActionForm>
  );
}
