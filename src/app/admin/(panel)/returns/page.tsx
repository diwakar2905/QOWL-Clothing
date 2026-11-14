import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Status, Table, Td } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Returns" };

export default async function ReturnsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("returns.read");
  const { status } = await searchParams;
  const list = await db.returnRequest.findMany({ where: status ? { status: status as "REQUESTED" } : { status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } }, orderBy: { createdAt: "desc" }, take: 200, include: { order: { select: { number: true, customerName: true } }, items: true } });
  return (
    <>
      <PageHeader title="Returns & exchanges" description={status ? `Status: ${status}` : "Open requests"} actions={<form><select name="status" defaultValue={status ?? ""} className="h-9 border hairline bg-ivory px-2 text-sm"><option value="">Open</option>{["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "IN_TRANSIT", "RECEIVED", "INSPECTED", "REFUND_PENDING", "EXCHANGE_SHIPPED", "COMPLETED", "REJECTED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}</select> <button className="h-9 border hairline bg-ivory px-3 text-sm">Filter</button></form>} />
      <Table head={["Request", "Order", "Type", "Units", "Reason", "Created", "Status"]} empty={list.length ? undefined : "No requests."}>
        {list.map((r) => (
          <tr key={r.id}>
            <Td><Link href={`/admin/returns/${r.id}`} className="font-medium text-forest">{r.number}</Link></Td>
            <Td>{r.order.number}<span className="block text-xs text-stone">{r.order.customerName}</span></Td>
            <Td>{r.type}</Td>
            <Td>{r.items.reduce((s, i) => s + i.quantity, 0)}</Td>
            <Td className="max-w-xs">{r.reason}</Td>
            <Td className="text-xs">{formatDateTime(r.createdAt)}</Td>
            <Td><Status value={r.status} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
