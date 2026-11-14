import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "@/components/auth/forms";
import { Logo } from "@/components/ui/misc";
import { safeInternalPath } from "@/lib/utils";

export const metadata = { title: "Staff sign in" };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getCurrentUser();
  if (u?.isStaff) redirect("/admin");
  const next = safeInternalPath((await searchParams).next, "/admin");
  return (
    <main className="haze on-dark flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm bg-ivory p-8 text-charcoal shadow-2xl">
        <Logo tone="forest" className="mx-auto h-16" />
        <h1 className="label-wide mt-6 text-center">Staff sign in</h1>
        {u && !u.isStaff && <p className="mt-4 text-center text-xs text-danger">This account doesn&apos;t have staff access.</p>}
        <div className="mt-6"><LoginForm staff next={next.startsWith("/admin") ? next : "/admin"} /></div>
      </div>
    </main>
  );
}
