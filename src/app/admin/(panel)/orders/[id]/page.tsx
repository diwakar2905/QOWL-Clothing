import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission, requirePermission } from "@/server/auth/session";
import { PageHeader, Card, Status } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/client";
import { CancelOrder, CreateShipment, ShipmentStatus, Refund, OrderNote } from "@/components/admin/order-client";
import { orderStatusAction, packingAction, releaseHoldAction, reconcileOrderAction, cancelShipmentAction } from "@/server/actions/admin/operations";
import { getShippingProvider } from "@/server/shipping";
import { formatINR, paiseToRupeesString } from "@/lib/money";
import { formatDateTime, safeHref } from "@/lib/utils";
import { humanise } from "@/domain/state-machines";

export const metadata = { title: "Order" };
type Addr = { fullName: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; phone: string };

export default async function OrderAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("orders.read");
  const user = await getCurrentUser();
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(user, p);
  const { id } = await params;
  const o = await db.order.findUnique({
    where: { id },
    include: { items: true, payments: { orderBy: { createdAt: "desc" } }, history: { orderBy: { createdAt: "desc" } }, notes: { orderBy: { createdAt: "desc" } }, shipments: { include: { events: { orderBy: { occurredAt: "desc" } } }, orderBy: { createdAt: "desc" } }, refunds: { orderBy: { createdAt: "desc" } }, returnRequests: true, user: { select: { id: true } } },
  });
  if (!o) notFound();
  const actors = new Map((await db.user.findMany({ where: { id: { in: [...o.history.map((h) => h.actorId), ...o.notes.map((n) => n.authorId)].filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]));
  const a = o.shippingAddress as Addr;
  const pendingRefunds = o.refunds.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amount, 0);
  const refundable = o.grandTotal - o.refundedTotal - pendingRefunds;
  const paid = ["PAID", "PARTIALLY_REFUNDED", "COD_COLLECTED"].includes(o.paymentStatus);
  const fulfillable = ["CONFIRMED", "PROCESSING"].includes(o.status);
  const activeShipment = o.shipments.find((s) => !s.cancelledAt && !s.isExchange && !s.isReturn);
  const provider = getShippingProvider();
  return (
    <>
      <PageHeader
        title={o.number}
        back={{ href: "/admin/orders", label: "Orders" }}
        description={<span className="flex flex-wrap items-center gap-2">Placed {formatDateTime(o.placedAt)} · <Status value={o.status} /> <Status value={o.paymentStatus} /> <Status value={o.fulfillmentStatus} /></span>}
        actions={<Link href={`/orders/${o.number}/invoice`} target="_blank" className="label border hairline bg-ivory px-3 py-2">Invoice</Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="Actions">
            <div className="flex flex-wrap gap-2">
              {o.status === "ON_HOLD" && can("orders.update") && <ActionButton variant="primary" action={releaseHoldAction.bind(null, o.id)}>Release hold (commit stock)</ActionButton>}
              {o.status === "CANCELLATION_REQUESTED" && can("orders.update") && <ActionButton action={orderStatusAction.bind(null, o.id, "PROCESSING", "Cancellation declined")}>Decline cancellation</ActionButton>}
              {fulfillable && can("orders.fulfill") && o.fulfillmentStatus === "UNFULFILLED" && <ActionButton action={packingAction.bind(null, o.id, "PACKED")}>Mark packed</ActionButton>}
              {fulfillable && can("orders.fulfill") && !activeShipment && ["UNFULFILLED", "PACKED"].includes(o.fulfillmentStatus) && <CreateShipment orderId={o.id} automation={!!provider.createShipment} />}
              {["PENDING_PAYMENT", "PAYMENT_FAILED", "EXPIRED"].includes(o.status) && o.paymentMethod === "ONLINE" && can("orders.update") && <ActionButton action={reconcileOrderAction.bind(null, o.id)}>Check payment with gateway</ActionButton>}
              {can("orders.refund") && paid && refundable > 0 && <Refund orderId={o.id} max={paiseToRupeesString(refundable)} cod={o.paymentMethod === "COD"} />}
              {can("orders.cancel") && !["CANCELLED", "COMPLETED", "EXPIRED"].includes(o.status) && ["UNFULFILLED", "PACKED", "READY_TO_SHIP"].includes(o.fulfillmentStatus) && <CancelOrder orderId={o.id} paid={paid} cod={o.paymentMethod === "COD"} />}
            </div>
            {o.status === "ON_HOLD" && <p className="mt-3 text-sm text-warning">This order needs attention — see history for the reason (e.g. payment captured but stock unavailable, or amount mismatch). Restock and release the hold, or cancel and refund.</p>}
            {o.paymentStatus === "PAID" && o.status === "CANCELLED" && <p className="mt-3 text-sm text-warning">Payment was captured on a cancelled order — issue a refund.</p>}
          </Card>
          <Card title="Items">
            <ul className="divide-y hairline text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex gap-3 py-3">
                  <span className="relative h-16 w-12 shrink-0 bg-cream">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="48px" className="object-cover" />}</span>
                  <div className="flex-1">{i.productName} — {i.colorName} / {i.size} × {i.quantity}<span className="block font-mono text-xs text-stone">{i.sku} · HSN {i.hsnCode} · GST {i.taxRateBps / 100}%</span>{i.returnedQty > 0 && <span className="text-xs text-warning">{i.returnedQty} returned</span>}</div>
                  <div className="text-right tabular-nums">{formatINR(i.lineTotal)}{i.lineDiscount > 0 && <span className="block text-xs text-forest">−{formatINR(i.lineDiscount)}</span>}</div>
                </li>
              ))}
            </ul>
            <dl className="ml-auto mt-3 w-64 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(o.subtotal)}</dd></div>
              {o.discountTotal > 0 && <div className="flex justify-between"><dt>Discount {o.couponCode}</dt><dd>−{formatINR(o.discountTotal)}</dd></div>}
              <div className="flex justify-between"><dt>Shipping</dt><dd>{formatINR(o.shippingTotal)}</dd></div>
              {o.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd>{formatINR(o.codFee)}</dd></div>}
              <div className="flex justify-between font-medium"><dt>Total</dt><dd>{formatINR(o.grandTotal)}</dd></div>
              <div className="flex justify-between text-stone"><dt>GST incl.</dt><dd>{formatINR(o.taxTotal)}</dd></div>
              {o.refundedTotal > 0 && <div className="flex justify-between text-forest"><dt>Refunded</dt><dd>{formatINR(o.refundedTotal)}</dd></div>}
            </dl>
          </Card>
          <Card title="Shipments">
            {o.shipments.length === 0 ? <p className="text-sm text-stone">No shipments yet.</p> : o.shipments.map((s) => {
              const t = safeHref(s.trackingUrl);
              const label = safeHref(s.labelUrl);
              return (
                <div key={s.id} className="mb-4 border hairline p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>{s.isExchange && <strong>Exchange · </strong>}{s.courierName ?? s.provider} · AWB <span className="font-mono">{s.awb ?? "—"}</span> · <Status value={s.status} />{s.cancelledAt && " (cancelled)"}</p>
                    <div className="flex gap-2">
                      {t && <a href={t} target="_blank" rel="noopener noreferrer" className="label text-forest">Track</a>}
                      {label && <a href={label} target="_blank" rel="noopener noreferrer" className="label text-forest">Label</a>}
                      {!s.cancelledAt && can("orders.fulfill") && !["DELIVERED", "RTO_DELIVERED"].includes(s.status) && <ShipmentStatus orderId={o.id} shipmentId={s.id} />}
                      {!s.cancelledAt && s.status === "READY_TO_SHIP" && can("orders.fulfill") && <ActionButton size="sm" variant="ghost" confirm="Cancel this shipment?" action={cancelShipmentAction.bind(null, s.id, o.id)}>Cancel</ActionButton>}
                    </div>
                  </div>
                  {s.events.length > 0 && <ul className="mt-2 space-y-1 text-xs text-stone">{s.events.map((e) => <li key={e.id}>{formatDateTime(e.occurredAt)} — {e.description ?? e.status}{e.location && ` · ${e.location}`}</li>)}</ul>}
                </div>
              );
            })}
          </Card>
          <Card title="History">
            <ul className="space-y-1.5 text-sm">
              {o.history.map((h) => <li key={h.id} className="grid grid-cols-[150px_1fr] gap-3"><span className="text-xs text-stone">{formatDateTime(h.createdAt)}</span><span><span className="text-xs uppercase text-stone">{h.field}</span> {h.fromValue ? `${humanise(h.fromValue)} → ` : ""}{humanise(h.toValue)} <span className="text-xs text-stone">· {h.actorType.toLowerCase()}{h.actorId ? ` ${actors.get(h.actorId) ?? ""}` : ""}</span>{h.note && <span className="block text-xs">{h.note}</span>}</span></li>)}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Customer">
            <p className="text-sm">{o.customerName}<br />{o.email}<br />{o.phone}</p>
            {o.user && can("customers.read") && <Link href={`/admin/customers/${o.user.id}`} className="label mt-2 inline-block text-forest">Customer profile</Link>}
            {o.customerNote && <p className="mt-3 border-l-2 border-forest pl-3 text-sm italic">“{o.customerNote}”</p>}
          </Card>
          <Card title="Ship to">
            <address className="text-sm not-italic">{a.fullName}<br />{a.line1}{a.line2 && <>, {a.line2}</>}<br />{a.landmark && <>{a.landmark}<br /></>}{a.city}, {a.state} {a.pincode}<br />{a.phone}</address>
          </Card>
          <Card title="Payments">
            {o.payments.length === 0 && <p className="text-sm text-stone">{o.paymentMethod === "COD" ? "Cash on Delivery" : "No payment attempts."}</p>}
            <ul className="space-y-2 text-xs">{o.payments.map((p) => <li key={p.id} className="border hairline p-2"><Status value={p.status} /> {formatINR(p.amount)} · {p.provider}{p.method && ` · ${p.method}`}<span className="block font-mono text-stone">{p.providerOrderId}{p.providerPaymentId && ` / ${p.providerPaymentId}`}</span>{p.errorDescription && <span className="block text-danger">{p.errorDescription}</span>}</li>)}</ul>
          </Card>
          <Card title="Refunds">
            {o.refunds.length === 0 ? <p className="text-sm text-stone">None.</p> : <ul className="space-y-2 text-xs">{o.refunds.map((r) => <li key={r.id} className="border hairline p-2"><Status value={r.status} /> {formatINR(r.amount)} · {r.method.toLowerCase()}<span className="block">{r.reason}</span><span className="block font-mono text-stone">{r.providerRefundId ?? r.manualReference}</span>{r.failureReason && <span className="block text-danger">{r.failureReason}</span>}</li>)}</ul>}
          </Card>
          {o.returnRequests.length > 0 && <Card title="Returns">{o.returnRequests.map((r) => <Link key={r.id} href={`/admin/returns/${r.id}`} className="block text-sm text-forest">{r.number} · {humanise(r.status)}</Link>)}</Card>}
          <Card title="Internal notes">
            <ul className="mb-3 space-y-2 text-sm">{o.notes.map((n) => <li key={n.id} className="border-l-2 hairline pl-3">{n.body}<span className="block text-xs text-stone">{actors.get(n.authorId)} · {formatDateTime(n.createdAt)}</span></li>)}</ul>
            <OrderNote orderId={o.id} />
          </Card>
        </div>
      </div>
    </>
  );
}
