import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission, requirePermission } from "@/server/auth/session";
import { suggestedRefund } from "@/server/services/returns";
import { PageHeader, Card, Status } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/client";
import { ReturnActions, InspectForm, RefundReturnForm, ShipExchangeForm } from "@/components/admin/return-client";
import { completeReturnAction } from "@/server/actions/admin/operations";
import { formatINR, paiseToRupeesString } from "@/lib/money";
import { formatDateTime, safeHref } from "@/lib/utils";

export const metadata = { title: "Return request" };

export default async function ReturnAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("returns.read");
  const user = await getCurrentUser();
  const { id } = await params;
  const r = await db.returnRequest.findUnique({ where: { id }, include: { order: true, items: { include: { orderItem: true } }, refunds: true } });
  if (!r) notFound();
  const exchangeVariants = await db.productVariant.findMany({ where: { id: { in: r.items.map((i) => i.exchangeVariantId).filter((x): x is string => !!x) } }, include: { color: true } });
  const suggested = await suggestedRefund(r.id);
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user, p);
  return (
    <>
      <PageHeader title={r.number} back={{ href: "/admin/returns", label: "Returns" }} description={<span className="flex items-center gap-2">{r.type} for <Link href={`/admin/orders/${r.orderId}`} className="text-forest">{r.order.number}</Link> · <Status value={r.status} /></span>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="Request">
            <p className="text-sm"><strong>Reason:</strong> {r.reason}</p>
            {r.customerNote && <p className="mt-2 text-sm italic">“{r.customerNote}”</p>}
            {r.rejectionReason && <p className="mt-2 text-sm text-danger">Rejected: {r.rejectionReason}</p>}
            <ul className="mt-4 divide-y hairline text-sm">
              {r.items.map((i) => {
                const ex = exchangeVariants.find((v) => v.id === i.exchangeVariantId);
                return <li key={i.id} className="py-2">{i.orderItem.productName} — {i.orderItem.colorName}/{i.orderItem.size} × {i.quantity}{ex && <span className="block text-forest">Exchange for {ex.color.name} / {ex.size}</span>}{(i.restockedQty > 0 || i.damagedQty > 0) && <span className="block text-xs text-stone">Inspected: {i.restockedQty} restocked, {i.damagedQty} damaged{i.inspectionNote && ` — ${i.inspectionNote}`}</span>}</li>;
              })}
            </ul>
            {r.photoUrls.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">{r.photoUrls.map((u) => { const h = safeHref(u); return h ? <a key={u} href={h} target="_blank" rel="noopener noreferrer" className="block h-24 w-24 overflow-hidden border hairline">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={h} alt="Customer return photo" className="h-full w-full object-cover" /></a> : null; })}</div>
            )}
          </Card>
          {can("returns.manage") && <Card title="Workflow"><ReturnActions returnId={r.id} status={r.status} canReceive={can("returns.inspect")} /></Card>}
          {r.status === "RECEIVED" && can("returns.inspect") && <Card title="Inspection"><InspectForm returnId={r.id} items={r.items.map((i) => ({ id: i.id, label: `${i.orderItem.productName} ${i.orderItem.colorName}/${i.orderItem.size}`, quantity: i.quantity }))} /></Card>}
          {r.type === "RETURN" && ["INSPECTED", "REFUND_PENDING"].includes(r.status) && can("orders.refund") && <Card title="Refund"><p className="mb-3 text-sm text-stone">Suggested: {formatINR(suggested)} (amount paid for the returned units, after discounts).</p><RefundReturnForm returnId={r.id} suggested={paiseToRupeesString(suggested)} cod={r.order.paymentMethod === "COD"} /></Card>}
          {r.type === "EXCHANGE" && r.status === "INSPECTED" && can("orders.fulfill") && <Card title="Ship replacement"><ShipExchangeForm returnId={r.id} /></Card>}
          {["REFUND_PENDING", "EXCHANGE_SHIPPED", "INSPECTED"].includes(r.status) && can("returns.manage") && <ActionButton action={() => completeReturnAction(r.id)}>Mark completed</ActionButton>}
        </div>
        <div className="space-y-6">
          <Card title="Timeline"><ul className="space-y-1 text-sm"><li>Requested {formatDateTime(r.createdAt)}</li>{r.pickupScheduledAt && <li>Pickup {formatDateTime(r.pickupScheduledAt)}</li>}{r.receivedAt && <li>Received {formatDateTime(r.receivedAt)}</li>}{r.inspectedAt && <li>Inspected {formatDateTime(r.inspectedAt)}</li>}</ul></Card>
          <Card title="Refunds">{r.refunds.length ? r.refunds.map((f) => <p key={f.id} className="text-sm"><Status value={f.status} /> {formatINR(f.amount)}</p>) : <p className="text-sm text-stone">None.</p>}</Card>
        </div>
      </div>
    </>
  );
}
