import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Card } from "@/components/admin/ui";
import { CollectionForm } from "@/components/admin/collection-forms";

export const metadata = { title: "New collection" };

export default async function NewCollection() {
  await requirePermission("catalog.write");
  const cats = await db.category.findMany({ select: { slug: true, name: true } });
  return <><PageHeader title="New collection" back={{ href: "/admin/collections", label: "Collections" }} /><Card><CollectionForm categories={cats} data={null} /></Card></>;
}
