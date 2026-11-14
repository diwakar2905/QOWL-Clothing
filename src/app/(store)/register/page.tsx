import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/forms";
import { safeInternalPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/account");
  return (
    <AuthShell title="Join QOWL" subtitle="Track orders, save addresses, request returns and keep your wishlist across devices.">
      <RegisterForm next={safeInternalPath(sp.next, "/account")} email={sp.email?.slice(0, 254)} />
    </AuthShell>
  );
}
