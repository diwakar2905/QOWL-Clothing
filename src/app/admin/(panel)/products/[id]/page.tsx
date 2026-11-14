import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission, requirePermission } from "@/server/auth/session";
import { publishBlockers } from "@/server/services/catalog-admin";
import { PageHeader, Card, Status } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";
import { StatusPanel, VariantsPanel, ImagesPanel } from "@/components/admin/product-panels";
import { paiseToRupeesString } from "@/lib/money";
import { FormMessage } from "@/components/ui/form";

export const metadata = { title: "Edit product" };

const toLocal = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : "");

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePermission("catalog.read");
  const user = await getCurrentUser();
  const { id } = await params;
  const p = await db.product.findUnique({ where: { id }, include: { colors: { orderBy: { sortOrder: "asc" } }, variants: { include: { inventory: true }, orderBy: [{ colorId: "asc" }, { sizeRank: "asc" }] }, images: { orderBy: { sortOrder: "asc" } } } });
  if (!p) notFound();
  const [categories, taxClasses, sizeGuides, blockers] = await Promise.all([db.category.findMany({ orderBy: { sortOrder: "asc" } }), db.taxClass.findMany(), db.sizeGuide.findMany(), publishBlockers(id)]);
  const canWrite = hasPermission(user, "catalog.write");
  return (
    <>
      <PageHeader title={p.name} back={{ href: "/admin/products", label: "Products" }} description={<span className="flex items-center gap-2">{p.styleCode} <Status value={p.status} />{p.isFixture && <span className="text-warning">Development fixture</span>}</span>} />
      {(await searchParams).created && <div className="mb-4"><FormMessage tone="success">Draft created. Next: add colours and sizes, upload images, add stock in Inventory, then publish.</FormMessage></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {canWrite ? (
            <Card title="Details">
              <ProductForm
                categories={categories}
                taxClasses={taxClasses.map((t) => ({ id: t.id, name: t.name, reviewed: !!t.reviewedAt }))}
                sizeGuides={sizeGuides}
                data={{
                  id: p.id, name: p.name, slug: p.slug, styleCode: p.styleCode, subtitle: p.subtitle ?? "", description: p.description, story: p.story ?? "", categoryId: p.categoryId, garmentType: p.garmentType,
                  price: paiseToRupeesString(p.price), mrp: paiseToRupeesString(p.mrp), salePrice: p.salePrice != null ? paiseToRupeesString(p.salePrice) : "", saleStartsAt: toLocal(p.saleStartsAt), saleEndsAt: toLocal(p.saleEndsAt), taxClassId: p.taxClassId,
                  fabric: p.fabric ?? "", gsm: p.gsm ?? "", fit: p.fit ?? "", careInstructions: p.careInstructions ?? "", countryOfOrigin: p.countryOfOrigin ?? "", manufacturerInfo: p.manufacturerInfo ?? "", marketerInfo: p.marketerInfo ?? "", netQuantity: p.netQuantity ?? "", detailsApproved: p.detailsApproved,
                  sizeGuideId: p.sizeGuideId ?? "", tags: p.tags.join(", "), isFeatured: p.isFeatured, sortOrder: String(p.sortOrder), seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
                }}
              />
            </Card>
          ) : <Card title="Details"><p className="text-sm">Read-only access.</p></Card>}
          {canWrite && <Card title="Colours, sizes & SKUs"><VariantsPanel productId={p.id} colors={p.colors} variants={p.variants.map((v) => ({ id: v.id, colorId: v.colorId, size: v.size, sku: v.sku, priceOverride: v.priceOverride, isActive: v.isActive, onHand: v.inventory?.onHand ?? 0, reserved: v.inventory?.reserved ?? 0 }))} /></Card>}
          {canWrite && <Card title="Images"><ImagesPanel productId={p.id} colors={p.colors} images={p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, colorId: i.colorId, kind: i.kind, isConcept: i.isConcept }))} /></Card>}
        </div>
        <div className="space-y-6">
          <Card title="Publishing"><StatusPanel id={p.id} slug={p.slug} status={p.status} publishAt={toLocal(p.publishAt)} blockers={blockers} canPublish={hasPermission(user, "catalog.publish")} /></Card>
        </div>
      </div>
    </>
  );
}
