import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { toCsv } from "@/server/services/newsletter";
import { handle } from "@/server/api";

export const GET = handle(async () => {
  await requirePermission("inventory.read");
  const vs = await db.productVariant.findMany({ include: { product: true, color: true, inventory: true }, orderBy: [{ product: { name: "asc" } }, { sizeRank: "asc" }] });
  const csv = toCsv([
    ["sku", "product", "color", "size", "active", "on_hand", "reserved", "available", "committed", "returned_pending", "damaged", "low_stock_threshold"],
    ...vs.map((v) => [v.sku, v.product.name, v.color.name, v.size, v.isActive ? "yes" : "no", v.inventory?.onHand ?? 0, v.inventory?.reserved ?? 0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0), v.inventory?.committed ?? 0, v.inventory?.returnedPending ?? 0, v.inventory?.damaged ?? 0, v.inventory?.lowStockThreshold ?? 0]),
  ]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="qowl-inventory-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
});
