import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Status, Table, Td, Pager } from "@/components/admin/ui";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Orders" };
const PER = 50;

export default async function OrdersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; payment?: string; view?: string; page?: string }> }) {
  await requirePermission("orders.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.OrderWhereInput = {
    ...(sp.status ? { status: sp.status as Prisma.OrderWhereInput["status"] } : sp.view === "all" ? {} : { status: { notIn: ["EXPIRED"] } }),
    ...(sp.payment ? { paymentStatus: sp.payment as Prisma.OrderWhereInput["paymentStatus"] } : {}),
    ...(sp.view === "fulfil" ? { status: { in: ["CONFIRMED", "PROCESSING"] }, fulfillmentStatus: { in: ["UNFULFILLED", "PACKED", "READY_TO_SHIP"] } } : {}),
    ...(sp.q ? { OR: [{ number: { contains: sp.q.trim(), mode: "insensitive" } }, { email: { contains: sp.q.trim(), mode: "insensitive" } }, { phone: { contains: sp.q.trim() } }, { customerName: { contains: sp.q.trim(), mode: "insensitive" } }] } : {}),
  };
  const [orders, total] = await Promise.all([db.order.findMany({ where, orderBy: { placedAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { _count: { select: { items: true } } } }), db.order.count({ where })]);
  const qs = (p: number) => `/admin/orders?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.payment ? { payment: sp.payment } : {}), ...(sp.view ? { view: sp.view } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title="Orders" description={`${total} order(s)`} />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {[["", "All"], ["fulfil", "To fulfil"], ["all", "Include expired"]].map(([v, l]) => <Link key={v} href={v ? `/admin/orders?view=${v}` : "/admin/orders"} className={`border px-3 py-1.5 ${(sp.view ?? "") === v && !sp.status ? "border-forest bg-forest text-ivory" : "hairline bg-ivory"}`}>{l}</Link>)}
        <Link href="/admin/orders?status=ON_HOLD" className="border hairline bg-ivory px-3 py-1.5">On hold</Link>
        <Link href="/admin/orders?status=CANCELLATION_REQUESTED" className="border hairline bg-ivory px-3 py-1.5">Cancellation requests</Link>
      </div>
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={sp.q} placeholder="Order no., email, phone or name" className="h-10 w-72 border hairline bg-ivory px-3" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-10 border hairline bg-ivory px-2"><option value="">Any order status</option>{["PENDING_PAYMENT", "PAYMENT_FAILED", "CONFIRMED", "PROCESSING", "ON_HOLD", "CANCELLATION_REQUESTED", "CANCELLED", "COMPLETED", "EXPIRED"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="payment" defaultValue={sp.payment ?? ""} className="h-10 border hairline bg-ivory px-2"><option value="">Any payment</option>{["PENDING", "PAID", "FAILED", "COD_PENDING", "COD_COLLECTED", "PARTIALLY_REFUNDED", "REFUNDED"].map((s) => <option key={s}>{s}</option>)}</select>
        <button className="h-10 border hairline bg-ivory px-4">Search</button>
      </form>
      <Table head={["Order", "Placed", "Customer", "Items", "Total", "Order", "Payment", "Fulfilment"]} empty={orders.length ? undefined : "No orders found."}>
        {orders.map((o) => (
          <tr key={o.id} className="hover:bg-cream/40">
            <Td><Link href={`/admin/orders/${o.id}`} className="font-medium text-forest">{o.number}</Link>{o.paymentMethod === "COD" && <span className="block text-xs text-stone">COD</span>}</Td>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(o.placedAt)}</Td>
            <Td>{o.customerName}<span className="block text-xs text-stone">{o.email}</span></Td>
            <Td>{o._count.items}</Td>
            <Td className="tabular-nums">{formatINR(o.grandTotal)}</Td>
            <Td><Status value={o.status} /></Td>
            <Td><Status value={o.paymentStatus} /></Td>
            <Td><Status value={o.fulfillmentStatus} /></Td>
          </tr>
        ))}
      </Table>
      <Pager page={page} pages={Math.ceil(total / PER)} href={qs} />
    </>
  );
}
