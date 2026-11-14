import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission, requirePermission } from "@/server/auth/session";
import { PageHeader, Card, Status } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/client";
import { CollectionForm, CollectionProducts } from "@/components/admin/collection-forms";
import { setCollectionStatusAction } from "@/server/actions/admin/catalog";

export const metadata = { title: "Collection" };

export default async function CollectionAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("catalog.read");
  const user = await getCurrentUser();
  const { id } = await params;
  const c = await db.collection.findUnique({ where: { id }, include: { products: { orderBy: { sortOrder: "asc" } } } });
  if (!c) notFound();
  const [cats, products] = await Promise.all([db.category.findMany({ select: { slug: true, name: true } }), db.product.findMany({ select: { id: true, name: true, status: true }, orderBy: { name: "asc" } })]);
  const rules = (c.rules ?? {}) as { categorySlugs?: string[]; tags?: string[] };
  return (
    <>
      <PageHeader title={c.title} back={{ href: "/admin/collections", label: "Collections" }} description={<Status value={c.status} />} actions={hasPermission(user, "catalog.publish") ? <>
        {c.status !== "ACTIVE" && <ActionButton variant="primary" action={() => setCollectionStatusAction(c.id, "ACTIVE")}>Publish</ActionButton>}
        {c.status === "ACTIVE" && <ActionButton action={() => setCollectionStatusAction(c.id, "DRAFT")}>Unpublish</ActionButton>}
        {c.status !== "ARCHIVED" && <ActionButton variant="danger" confirm="Archive this collection?" action={() => setCollectionStatusAction(c.id, "ARCHIVED")}>Archive</ActionButton>}
      </> : null} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card title="Details"><CollectionForm categories={cats} data={{ id: c.id, title: c.title, slug: c.slug, eyebrow: c.eyebrow ?? "", description: c.description ?? "", heroImageUrl: c.heroImageUrl ?? "", mobileImageUrl: c.mobileImageUrl ?? "", imageAlt: c.imageAlt ?? "", type: c.type, linkType: c.linkType, editorialHref: c.editorialHref ?? "", ruleCategories: (rules.categorySlugs ?? []).join(", "), ruleTags: (rules.tags ?? []).join(", "), sortOrder: String(c.sortOrder), showInExplore: c.showInExplore, seoTitle: c.seoTitle ?? "", seoDescription: c.seoDescription ?? "" }} /></Card>
        {c.type === "MANUAL" && c.linkType === "PRODUCTS" && <Card title="Products (in order)"><CollectionProducts collectionId={c.id} selected={c.products.map((p) => p.productId)} products={products} /></Card>}
      </div>
    </>
  );
}
