import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/session";
import { getOrderForAccess } from "@/server/services/orders";
import { getSetting } from "@/server/services/settings";
import { canRequestReturn } from "@/domain/returns";
import { ReturnRequestForm } from "@/components/account/return-form";
import { FormMessage } from "@/components/ui/form";

export const metadata: Metadata = { title: "Return or exchange", robots: { index: false } };

export default async function ReturnPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const { number } = await params;
  const order = await getOrderForAccess(number, { userId: user.id });
  if (!order) notFound();
  const policy = await getSetting("returns");
  const ret = canRequestReturn(policy, order, "RETURN");
  const exch = canRequestReturn(policy, order, "EXCHANGE");
  if (!ret.ok && !exch.ok) return <FormMessage tone="info">{ret.ok ? "" : ret.reason}</FormMessage>;
  const open = await db.returnItem.groupBy({ by: ["orderItemId"], where: { orderItemId: { in: order.items.map((i) => i.id) }, returnRequest: { status: { notIn: ["REJECTED", "CANCELLED"] } } }, _sum: { quantity: true } });
  const used = new Map(open.map((o) => [o.orderItemId, o._sum.quantity ?? 0]));
  const variants = await db.productVariant.findMany({ where: { productId: { in: order.items.map((i) => i.productId!).filter(Boolean) }, isActive: true }, include: { color: true, inventory: true } });
  return (
    <div>
      <h2 className="display text-4xl">Return or exchange</h2>
      <p className="mt-2 text-sm text-charcoal/80">Order {order.number}. {policy.policySummary}</p>
      <ReturnRequestForm
        number={order.number}
        allowReturn={ret.ok}
        allowExchange={exch.ok}
        reasons={policy.reasons}
        requirePhotos={policy.requirePhotos}
        items={order.items.map((i) => ({
          id: i.id,
          name: i.productName,
          variant: `${i.colorName} / ${i.size}`,
          max: i.quantity - (used.get(i.id) ?? 0),
          options: variants.filter((v) => v.productId === i.productId && v.id !== i.variantId && (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) > 0).map((v) => ({ id: v.id, label: `${v.color.name} / ${v.size}` })),
        }))}
      />
    </div>
  );
}
