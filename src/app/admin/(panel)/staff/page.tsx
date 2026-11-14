import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Card, Table, Td, Status } from "@/components/admin/ui";
import { StaffForm, RoleForm } from "@/components/admin/staff-client";
import { PERMISSIONS } from "@/server/auth/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Staff & roles" };

export default async function StaffAdmin() {
  await requirePermission("staff.manage");
  const [staff, roles] = await Promise.all([db.user.findMany({ where: { roleId: { not: null } }, include: { role: true }, orderBy: { createdAt: "asc" } }), db.role.findMany({ orderBy: { name: "asc" } })]);
  const roleOpts = roles.map((r) => ({ id: r.id, name: r.name }));
  return (
    <>
      <PageHeader title="Staff & roles" description="Permissions are enforced on the server for every admin page and action." />
      <Table head={["Staff member", "Role", "Last sign-in", "Status", ""]}>
        {staff.map((s) => <tr key={s.id}><Td>{s.name ?? "—"}<span className="block text-xs text-stone">{s.email}</span></Td><Td>{s.role?.name}</Td><Td className="text-xs">{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "never"}</Td><Td><Status value={s.status} /></Td><Td><details><summary className="label cursor-pointer text-forest">Edit</summary><div className="mt-2 w-80"><StaffForm roles={roleOpts} s={{ id: s.id, name: s.name ?? "", roleId: s.roleId ?? "", disabled: s.status === "SUSPENDED" }} /></div></details></Td></tr>)}
      </Table>
      <Card title="Add staff member" className="mt-6"><StaffForm roles={roleOpts} /></Card>
      <h2 className="label-wide mb-3 mt-10">Roles</h2>
      <div className="space-y-4">
        {roles.map((r) => <Card key={r.id} title={`${r.name}${r.isSystem ? " (system)" : ""}`}><RoleForm permissions={PERMISSIONS} r={{ id: r.id, name: r.name, description: r.description ?? "", permissions: r.permissions, locked: r.key === "super_admin" }} /></Card>)}
        <Card title="New role"><RoleForm permissions={PERMISSIONS} /></Card>
      </div>
    </>
  );
}
