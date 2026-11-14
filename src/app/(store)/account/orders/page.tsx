import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/session";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { customerStatusLabel } from "@/domain/state-machines";
import { EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Orders", robots: { index: false } };

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await db.order.findMany({ where: { userId: user.id, status: { notIn: ["EXPIRED"] } }, orderBy: { placedAt: "desc" }, take: 100, include: { items: { select: { productName: true, quantity: true } } } });
  if (!orders.length) return <EmptyState title="No orders yet" body="When you place an order it'll appear here." action={<ButtonLink href="/shop">Start shopping</ButtonLink>} />;
  return (
    <div>
      <h2 className="label-wide mb-4">Order history</h2>
      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/account/orders/${o.number}`} className="grid gap-1 border hairline p-4 text-sm hover:border-forest sm:grid-cols-[1fr_auto]">
              <span><span className="font-medium">{o.number}</span> · {formatDate(o.placedAt)}<span className="block text-charcoal/75">{o.items.map((i) => `${i.productName} ×${i.quantity}`).join(", ")}</span></span>
              <span className="sm:text-right"><span className="block font-medium">{customerStatusLabel(o)}</span><span className="tabular-nums">{formatINR(o.grandTotal)}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
