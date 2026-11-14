import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Card, Table, Td, Status } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/client";
import { CouponForm } from "@/components/admin/coupon-form";
import { toggleCouponAction } from "@/server/actions/admin/operations";
import { formatINR, paiseToRupeesString } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Discounts" };
const toLocal = (d: Date | null) => (d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : "");

export default async function Discounts({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requirePermission("discounts.manage");
  const { edit } = await searchParams;
  const [coupons, products, collections] = await Promise.all([
    db.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { products: true, collections: true, _count: { select: { redemptions: { where: { status: { in: ["RESERVED", "COMMITTED"] } } } } } } }),
    db.product.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.collection.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  const c = edit ? coupons.find((x) => x.id === edit) : null;
  return (
    <>
      <PageHeader title="Discounts" description="Codes are validated on the server at bag and checkout. One code per order (no stacking)." />
      <Card title={c ? `Edit ${c.code}` : "New discount code"} className="mb-6">
        <CouponForm
          key={c?.id ?? "new"}
          products={products}
          collections={collections}
          data={c ? { id: c.id, code: c.code, description: c.description ?? "", type: c.type, value: c.type === "PERCENT" ? String(c.value) : paiseToRupeesString(c.value), minCartValue: c.minCartValue != null ? paiseToRupeesString(c.minCartValue) : "", maxDiscount: c.maxDiscount != null ? paiseToRupeesString(c.maxDiscount) : "", startsAt: toLocal(c.startsAt), endsAt: toLocal(c.endsAt), usageLimit: c.usageLimit?.toString() ?? "", perCustomerLimit: c.perCustomerLimit?.toString() ?? "", firstOrderOnly: c.firstOrderOnly, scope: c.scope, isActive: c.isActive, productIds: c.products.map((p) => p.productId), collectionIds: c.collections.map((x) => x.collectionId) } : null}
        />
      </Card>
      <Table head={["Code", "Discount", "Rules", "Window", "Used", "Status", ""]} empty={coupons.length ? undefined : "No discount codes yet."}>
        {coupons.map((x) => (
          <tr key={x.id}>
            <Td><span className="font-mono font-medium">{x.code}</span><span className="block text-xs text-stone">{x.description}</span></Td>
            <Td>{x.type === "PERCENT" ? `${x.value}%` : formatINR(x.value)}{x.maxDiscount != null && <span className="block text-xs text-stone">max {formatINR(x.maxDiscount)}</span>}</Td>
            <Td className="text-xs">{[x.minCartValue != null && `min ${formatINR(x.minCartValue)}`, x.firstOrderOnly && "first order", x.perCustomerLimit != null && `${x.perCustomerLimit}/customer`, x.scope !== "ALL" && x.scope.toLowerCase()].filter(Boolean).join(" · ") || "—"}</Td>
            <Td className="text-xs">{x.startsAt ? formatDate(x.startsAt) : "now"} → {x.endsAt ? formatDate(x.endsAt) : "no end"}</Td>
            <Td>{x._count.redemptions}{x.usageLimit != null && ` / ${x.usageLimit}`}</Td>
            <Td><Status value={x.isActive ? "ACTIVE" : "ARCHIVED"} /></Td>
            <Td className="whitespace-nowrap"><a href={`/admin/discounts?edit=${x.id}`} className="label mr-3 text-forest">Edit</a><ActionButton size="sm" variant="ghost" action={toggleCouponAction.bind(null, x.id, !x.isActive)}>{x.isActive ? "Deactivate" : "Activate"}</ActionButton></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
