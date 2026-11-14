import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission, requirePermission } from "@/server/auth/session";
import { PageHeader, Status, Table, Td } from "@/components/admin/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Customers" };

function mask(email: string) {
  const [u, d] = email.split("@");
  return `${u!.slice(0, 2)}***@${d}`;
}

export default async function CustomersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requirePermission("customers.read");
  const pii = hasPermission(await getCurrentUser(), "customers.pii");
  const { q, status } = await searchParams;
  const users = await db.user.findMany({
    where: { roleId: null, ...(status ? { status: status as "ACTIVE" } : {}), ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, ...(pii ? [{ phone: { contains: q } }] : [])] } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true } } },
  });
  return (
    <>
      <PageHeader title="Customers" description={pii ? undefined : "Contact details are masked for your role."} />
      <form className="mb-4 flex gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Search name or email" className="h-10 w-72 border hairline bg-ivory px-3" />
        <select name="status" defaultValue={status ?? ""} className="h-10 border hairline bg-ivory px-2"><option value="">Any status</option><option>ACTIVE</option><option>SUSPENDED</option><option>DELETION_REQUESTED</option><option>DELETED</option></select>
        <button className="h-10 border hairline bg-ivory px-4">Search</button>
      </form>
      <Table head={["Customer", "Orders", "Marketing", "Joined", "Status"]} empty={users.length ? undefined : "No customers."}>
        {users.map((u) => (
          <tr key={u.id}>
            <Td><Link href={`/admin/customers/${u.id}`} className="font-medium text-forest">{u.name ?? "—"}</Link><span className="block text-xs text-stone">{pii ? u.email : mask(u.email)}</span></Td>
            <Td>{u._count.orders}</Td>
            <Td>{u.marketingOptIn ? "Opted in" : "—"}</Td>
            <Td className="text-xs">{formatDate(u.createdAt)}</Td>
            <Td><Status value={u.status} /></Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
