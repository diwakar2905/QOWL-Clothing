import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Card } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "New product" };

export default async function NewProduct() {
  await requirePermission("catalog.write");
  const [categories, taxClasses, sizeGuides] = await Promise.all([db.category.findMany({ orderBy: { sortOrder: "asc" } }), db.taxClass.findMany(), db.sizeGuide.findMany()]);
  return (
    <>
      <PageHeader title="New product" back={{ href: "/admin/products", label: "Products" }} description="Products are created as drafts. Add colours, variants, stock and images, then publish." />
      <Card>
        <ProductForm
          categories={categories}
          taxClasses={taxClasses.map((t) => ({ id: t.id, name: t.name, reviewed: !!t.reviewedAt }))}
          sizeGuides={sizeGuides}
          data={{ name: "", slug: "", styleCode: "", subtitle: "", description: "", story: "", categoryId: "", garmentType: "", price: "", mrp: "", salePrice: "", saleStartsAt: "", saleEndsAt: "", taxClassId: "", fabric: "", gsm: "", fit: "", careInstructions: "", countryOfOrigin: "India", manufacturerInfo: "", marketerInfo: "", netQuantity: "1 N", detailsApproved: false, sizeGuideId: "", tags: "", isFeatured: false, sortOrder: "0", seoTitle: "", seoDescription: "" }}
        />
      </Card>
    </>
  );
}
