import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { FormMessage } from "@/components/ui/form";
import { safeInternalPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  const next = safeInternalPath(sp.next, "/account");
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Sign in" subtitle="Access your orders, addresses and wishlist.">
      {sp.reset && <div className="mb-5"><FormMessage tone="success">Your password has been updated. Sign in with your new password.</FormMessage></div>}
      <LoginForm next={next} />
    </AuthShell>
  );
}
