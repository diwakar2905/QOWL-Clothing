import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { logoutAction } from "@/server/actions/auth";
import { Container } from "@/components/ui/misc";
import { AccountNav } from "@/components/account/account-nav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  if (user.isStaff) redirect("/admin");
  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label text-stone">My account</p>
          <h1 className="display mt-1 text-5xl text-obsidian">{user.name ? `Hi, ${user.name.split(" ")[0]}` : "Account"}</h1>
        </div>
        <form action={logoutAction}><button type="submit" className="label link-underline">Sign out</button></form>
      </div>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
      <p className="mt-16 text-xs text-stone">Need help? <Link href="/pages/grievance-redressal" className="underline">Contact customer care</Link>.</p>
    </Container>
  );
}
