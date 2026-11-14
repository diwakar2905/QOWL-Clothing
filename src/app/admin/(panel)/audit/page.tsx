import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Table, Td, Pager } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditAdmin({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  await requirePermission("audit.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.q ? { OR: [{ action: { contains: sp.q } }, { entityType: { contains: sp.q } }, { entityId: sp.q }] } : {};
  const [rows, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { actor: { select: { name: true, email: true } } } }), db.auditLog.count({ where })]);
  return (
    <>
      <PageHeader title="Audit log" description="Sensitive changes: pricing, stock, orders, refunds, settings, staff and roles." />
      <form className="mb-4"><input name="q" defaultValue={sp.q} placeholder="Filter by action / entity / id" className="h-10 w-80 border hairline bg-ivory px-3 text-sm" /></form>
      <Table head={["When", "Who", "Action", "Entity", "Details"]}>
        {rows.map((r) => <tr key={r.id}><Td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</Td><Td className="text-xs">{r.actor?.name ?? r.actor?.email ?? "system"}</Td><Td className="font-mono text-xs">{r.action}</Td><Td className="text-xs">{r.entityType} {r.entityId?.slice(0, 10)}</Td><Td className="max-w-md text-xs"><details><summary>{r.summary ?? "view"}</summary><pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap bg-cream p-2">{JSON.stringify({ before: r.before, after: r.after }, null, 1)}</pre></details></Td></tr>)}
      </Table>
      <Pager page={page} pages={Math.ceil(total / 50)} href={(p) => `/admin/audit?page=${p}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} />
    </>
  );
}
