import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission, requirePermission } from "@/server/auth/session";
import { PageHeader, Table, Td, Card } from "@/components/admin/ui";
import { AdjustStock, ImportCsv } from "@/components/admin/inventory-client";
import { formatDateTime } from "@/lib/utils";
import { humanise } from "@/domain/state-machines";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; low?: string; variant?: string }> }) {
  await requirePermission("inventory.read");
  const user = await getCurrentUser();
  const canWrite = hasPermission(user, "inventory.write");
  const { q, low, variant } = await searchParams;
  const where: Prisma.ProductVariantWhereInput = q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {};
  const variants = await db.productVariant.findMany({ where, include: { product: { select: { name: true, status: true } }, color: true, inventory: true }, orderBy: [{ product: { sortOrder: "asc" } }, { colorId: "asc" }, { sizeRank: "asc" }], take: 500 });
  const rows = variants
    .map((v) => ({ v, inv: v.inventory ?? { onHand: 0, reserved: 0, committed: 0, damaged: 0, returnedPending: 0, lowStockThreshold: 3 } }))
    .filter((r) => !low || r.inv.onHand - r.inv.reserved <= r.inv.lowStockThreshold);
  const history = variant ? await db.inventoryMovement.findMany({ where: { variantId: variant }, orderBy: { createdAt: "desc" }, take: 50 }) : [];
  const actors = new Map((await db.user.findMany({ where: { id: { in: history.map((h) => h.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]));
  const hv = variant ? variants.find((v) => v.id === variant) : null;
  return (
    <>
      <PageHeader title="Inventory" description="Available = on hand − reserved by pending checkouts. Committed units are sold and awaiting shipment. Returned units wait for inspection before restocking." actions={<a href="/api/admin/inventory/export" className="label border hairline bg-ivory px-3 py-2 hover:border-forest">Export CSV</a>} />
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Search SKU or product" className="h-10 w-72 border hairline bg-ivory px-3" />
        <label className="flex items-center gap-2"><input type="checkbox" name="low" value="1" defaultChecked={!!low} className="accent-forest" /> Low stock only</label>
        <button className="h-10 border hairline bg-ivory px-4">Filter</button>
      </form>
      {canWrite && <Card title="Bulk import" className="mb-4"><ImportCsv /></Card>}
      <Table head={["Product / SKU", "Available", "On hand", "Reserved", "Committed", "Returned (pending)", "Damaged", "Low at", ""]} empty={rows.length ? undefined : "No variants."}>
        {rows.map(({ v, inv }) => {
          const available = inv.onHand - inv.reserved;
          return (
            <tr key={v.id} className={available <= inv.lowStockThreshold ? "bg-warning/5" : undefined}>
              <Td><span className="font-medium">{v.product.name}</span> — {v.color.name} / {v.size}<span className="block font-mono text-xs text-stone">{v.sku}{!v.isActive && " · inactive"}{v.product.status !== "ACTIVE" && ` · ${v.product.status.toLowerCase()}`}</span></Td>
              <Td className={`tabular-nums font-medium ${available <= 0 ? "text-danger" : ""}`}>{available}</Td>
              <Td className="tabular-nums">{inv.onHand}</Td>
              <Td className="tabular-nums">{inv.reserved}</Td>
              <Td className="tabular-nums">{inv.committed}</Td>
              <Td className="tabular-nums">{inv.returnedPending}</Td>
              <Td className="tabular-nums">{inv.damaged}</Td>
              <Td className="tabular-nums">{inv.lowStockThreshold}</Td>
              <Td className="whitespace-nowrap">
                {canWrite && <AdjustStock variantId={v.id} label={`${v.product.name} ${v.color.name}/${v.size}`} threshold={inv.lowStockThreshold} />}
                <Link href={`/admin/inventory?variant=${v.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="label ml-3 text-forest">History</Link>
              </Td>
            </tr>
          );
        })}
      </Table>
      {hv && (
        <Card title={`Movement history — ${hv.sku}`} className="mt-6">
          {history.length === 0 ? <p className="text-sm text-stone">No movements.</p> : (
            <ul className="divide-y hairline text-sm">
              {history.map((h) => (
                <li key={h.id} className="grid gap-1 py-2 sm:grid-cols-[160px_150px_1fr_auto]">
                  <span className="text-stone">{formatDateTime(h.createdAt)}</span>
                  <span className="font-medium">{humanise(h.type)}</span>
                  <span>{[h.onHandDelta && `on hand ${h.onHandDelta > 0 ? "+" : ""}${h.onHandDelta}`, h.committedDelta && `committed ${h.committedDelta > 0 ? "+" : ""}${h.committedDelta}`, h.damagedDelta && `damaged +${h.damagedDelta}`, h.returnedDelta && `returned ${h.returnedDelta > 0 ? "+" : ""}${h.returnedDelta}`].filter(Boolean).join(", ")}{h.reason && ` — ${h.reason}`}{h.note && ` (${h.note})`}</span>
                  <span className="text-xs text-stone">{h.actorId ? actors.get(h.actorId) : "system"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
