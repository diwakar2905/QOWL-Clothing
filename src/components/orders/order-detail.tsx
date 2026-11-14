import Image from "next/image";
import Link from "next/link";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime, safeHref } from "@/lib/utils";
import { customerStatusLabel, humanise } from "@/domain/state-machines";
import { Badge } from "@/components/ui/misc";
import type { getOrderForAccess } from "@/server/services/orders";
import { OrderActions } from "./order-actions";

type Order = NonNullable<Awaited<ReturnType<typeof getOrderForAccess>>>;
type Addr = { fullName: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; phone: string };

const STEPS = ["Confirmed", "Packed", "Shipped", "Out for delivery", "Delivered"];
function stepIndex(o: Order) {
  const map: Record<string, number> = { UNFULFILLED: 0, PACKED: 1, READY_TO_SHIP: 1, SHIPPED: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4 };
  return map[o.fulfillmentStatus] ?? 0;
}

export function OrderDetail({ order, token, returnEligible, canCancel }: { order: Order; token?: string | null; returnEligible: boolean; canCancel: boolean }) {
  const a = order.shippingAddress as Addr;
  const label = customerStatusLabel(order);
  const showProgress = ["CONFIRMED", "PROCESSING", "COMPLETED"].includes(order.status) && !order.fulfillmentStatus.startsWith("RTO");
  const idx = stepIndex(order);
  const invoiceHref = `/orders/${order.number}/invoice${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  const paid = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "COD_COLLECTED"].includes(order.paymentStatus);
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <p className="label text-stone">Order {order.number}</p>
          <p className="mt-1 font-serif text-3xl uppercase text-obsidian">{label}</p>
          <p className="mt-1 text-sm text-charcoal/75">Placed {formatDateTime(order.placedAt)} · {order.paymentMethod === "COD" ? "Cash on Delivery" : "Paid online"}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {paid && <Link href={invoiceHref} className="label border hairline px-4 py-2.5 hover:border-forest" target="_blank">Invoice</Link>}
          <OrderActions number={order.number} token={token ?? null} canCancel={canCancel} returnEligible={returnEligible} />
        </div>
      </div>

      {showProgress && (
        <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
          {STEPS.map((s, i) => (
            <li key={s} className="text-center">
              <span className={`block h-1 ${i <= idx ? "bg-forest" : "bg-soft"}`} />
              <span className={`mt-2 block text-[11px] uppercase tracking-wider ${i <= idx ? "text-forest" : "text-stone"}`} aria-current={i === idx ? "step" : undefined}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      {order.shipments.filter((s) => !s.cancelledAt).map((s) => {
        const tracking = safeHref(s.trackingUrl);
        return (
          <section key={s.id} className="border hairline p-5" aria-label="Shipment">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm"><span className="font-medium">{s.isExchange ? "Exchange shipment" : "Shipment"}</span> · {s.courierName ?? "Courier"} {s.awb && <>· AWB <span className="font-mono">{s.awb}</span></>}</p>
              {tracking && <a href={tracking} target="_blank" rel="noopener noreferrer" className="label text-forest link-underline">Track with courier</a>}
            </div>
            {s.events.length > 0 && (
              <ol className="mt-4 space-y-2 border-l hairline pl-4 text-sm">
                {s.events.slice(0, 8).map((e) => (
                  <li key={e.id}><span className="text-charcoal/90">{e.description ?? humanise(e.status)}</span>{e.location && <span className="text-stone"> · {e.location}</span>}<span className="block text-xs text-stone">{formatDateTime(e.occurredAt)}</span></li>
                ))}
              </ol>
            )}
          </section>
        );
      })}

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="items-h">
          <h2 id="items-h" className="label-wide mb-3">Items</h2>
          <ul className="divide-y hairline">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-4 py-4">
                <span className="relative block h-24 w-20 shrink-0 overflow-hidden bg-cream">{i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="80px" className="object-cover" />}</span>
                <div className="flex-1 text-sm">
                  <Link href={`/products/${i.productSlug}`} className="font-serif text-lg uppercase hover:text-forest">{i.productName}</Link>
                  <p className="text-charcoal/75">{i.colorName} / {i.size} · Qty {i.quantity}</p>
                  {i.returnedQty > 0 && <Badge className="mt-1">{i.returnedQty} returned</Badge>}
                </div>
                <p className="text-sm tabular-nums">{formatINR(i.lineTotal)}</p>
              </li>
            ))}
          </ul>
          {order.returnRequests.length > 0 && (
            <div className="mt-6">
              <h3 className="label mb-2">Return & exchange requests</h3>
              <ul className="space-y-2 text-sm">
                {order.returnRequests.map((r) => (
                  <li key={r.id} className="flex justify-between border hairline px-4 py-3"><span>{r.number} · {humanise(r.type)}</span><span className="font-medium">{humanise(r.status)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <aside className="space-y-6 text-sm">
          <section>
            <h2 className="label-wide mb-3">Summary</h2>
            <dl className="space-y-2">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(order.subtotal)}</dd></div>
              {order.discountTotal > 0 && <div className="flex justify-between text-forest"><dt>Discount {order.couponCode && `(${order.couponCode})`}</dt><dd className="tabular-nums">−{formatINR(order.discountTotal)}</dd></div>}
              <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{order.shippingTotal ? formatINR(order.shippingTotal) : "Free"}</dd></div>
              {order.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd className="tabular-nums">{formatINR(order.codFee)}</dd></div>}
              <div className="flex justify-between border-t hairline pt-2 font-medium"><dt>Total</dt><dd className="tabular-nums">{formatINR(order.grandTotal)}</dd></div>
              <p className="text-xs text-stone">Includes GST of {formatINR(order.taxTotal)}</p>
              {order.refundedTotal > 0 && <div className="flex justify-between text-forest"><dt>Refunded</dt><dd className="tabular-nums">{formatINR(order.refundedTotal)}</dd></div>}
            </dl>
          </section>
          {order.refunds.length > 0 && (
            <section>
              <h2 className="label-wide mb-2">Refunds</h2>
              <ul className="space-y-1">{order.refunds.map((r) => <li key={r.id} className="flex justify-between"><span>{formatINR(r.amount)} · {formatDate(r.createdAt)}</span><span>{humanise(r.status)}</span></li>)}</ul>
            </section>
          )}
          <section>
            <h2 className="label-wide mb-2">Delivering to</h2>
            <address className="not-italic leading-relaxed text-charcoal/85">
              {a.fullName}<br />{a.line1}{a.line2 && <>, {a.line2}</>}<br />{a.landmark && <>{a.landmark}<br /></>}{a.city}, {a.state} {a.pincode}<br />{a.phone}
            </address>
          </section>
        </aside>
      </div>
    </div>
  );
}
