import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Card } from "@/components/admin/ui";
import { CategoryForm } from "@/components/admin/category-form";

export const metadata = { title: "Categories" };

export default async function CategoriesAdmin() {
  await requirePermission("catalog.read");
  const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageHeader title="Categories" description="Categories drive navigation and category pages. New garment types (e.g. sweatshirts) can be added here without code changes." />
      <div className="space-y-4">
        {cats.map((c) => <Card key={c.id} title={`${c.name} · ${c._count.products} products`}><CategoryForm data={c} /></Card>)}
        <Card title="New category"><CategoryForm data={null} /></Card>
      </div>
    </>
  );
}
