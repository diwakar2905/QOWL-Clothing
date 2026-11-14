import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { logoutAction } from "@/server/actions/auth";
import { AdminShell } from "@/components/admin/shell";

/** Every admin page also checks its specific permission on the server; this layout only gates staff access. */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!user.isStaff) redirect("/admin/login");
  return (
    <AdminShell user={{ name: user.name, email: user.email, roleName: user.roleName }} permissions={user.permissions} logout={logoutAction}>
      {children}
    </AdminShell>
  );
}
