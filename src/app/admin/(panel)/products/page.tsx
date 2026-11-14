import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Status, Table, Td } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { formatINR } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Products" };

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requirePermission("catalog.read");
  const { q, status } = await searchParams;
  const where: Prisma.ProductWhereInput = {
    ...(status && ["DRAFT", "ACTIVE", "ARCHIVED"].includes(status) ? { status: status as "DRAFT" } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { styleCode: { contains: q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const products = await db.product.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], include: { category: true, images: { take: 1, orderBy: { sortOrder: "asc" } }, variants: { include: { inventory: true } } }, take: 200 });
  return (
    <>
      <PageHeader title="Products" description={`${products.length} shown`} actions={<ButtonLink href="/admin/products/new" size="sm">New product</ButtonLink>} />
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Search name, style code or SKU" className="h-10 w-72 border hairline bg-ivory px-3" />
        <select name="status" defaultValue={status ?? ""} className="h-10 border hairline bg-ivory px-3"><option value="">All statuses</option><option>DRAFT</option><option>ACTIVE</option><option>ARCHIVED</option></select>
        <button className="h-10 border hairline bg-ivory px-4">Filter</button>
      </form>
      <Table head={["", "Product", "Category", "Price", "Stock (available)", "Status"]} empty={products.length ? undefined : "No products match."}>
        {products.map((p) => {
          const avail = p.variants.reduce((s, v) => s + Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)), 0);
          return (
            <tr key={p.id} className="hover:bg-cream/40">
              <Td><div className="relative h-14 w-11 bg-cream">{p.images[0] && <Image src={p.images[0].url} alt="" fill sizes="44px" className="object-cover" />}</div></Td>
              <Td><Link href={`/admin/products/${p.id}`} className="font-medium hover:text-forest">{p.name}</Link><span className="block text-xs text-stone">{p.styleCode}{p.isFixture && " · dev fixture"}</span></Td>
              <Td>{p.category.name}</Td>
              <Td className="tabular-nums">{formatINR(p.price)}{p.salePrice != null && <span className="block text-xs text-forest">Sale {formatINR(p.salePrice)}</span>}</Td>
              <Td className="tabular-nums">{avail} <span className="text-xs text-stone">/ {p.variants.length} variants</span></Td>
              <Td><Status value={p.status} />{p.publishAt && p.publishAt > new Date() && <span className="mt-1 block text-xs text-stone">Scheduled</span>}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
