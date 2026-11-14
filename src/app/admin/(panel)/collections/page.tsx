import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Status, Table, Td } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Collections" };

export default async function CollectionsAdmin() {
  await requirePermission("catalog.read");
  const cols = await db.collection.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } });
  return (
    <>
      <PageHeader title="Collections" actions={<ButtonLink href="/admin/collections/new" size="sm">New collection</ButtonLink>} />
      <Table head={["Title", "Type", "Products", "Order", "Status"]}>
        {cols.map((c) => (
          <tr key={c.id}><Td><Link href={`/admin/collections/${c.id}`} className="font-medium text-forest">{c.title}</Link><span className="block text-xs text-stone">/{c.slug}</span></Td><Td>{c.linkType === "EDITORIAL" ? "Editorial link" : c.type === "RULE" ? "Rule-based" : "Manual"}</Td><Td>{c.type === "MANUAL" ? c._count.products : "auto"}</Td><Td>{c.sortOrder}</Td><Td><Status value={c.status} /></Td></tr>
        ))}
      </Table>
    </>
  );
}
