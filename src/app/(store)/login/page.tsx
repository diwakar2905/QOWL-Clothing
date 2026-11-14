import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/forms";
import { FormMessage } from "@/components/ui/form";
import { safeInternalPath } from "@/lib/utils";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { isGoogleEnabled } from "@/server/auth/google";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeInternalPath(sp.next, "/account");
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Sign in" subtitle={next === "/checkout" ? "Sign in to complete your order. Your bag is saved." : "Access your orders, addresses and wishlist."}>
      {sp.reset && <div className="mb-5"><FormMessage tone="success">Your password has been updated. Sign in with your new password.</FormMessage></div>}
      {isGoogleEnabled() ? <div className="mb-6"><GoogleSignIn next={next} error={sp.error} /></div> : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
