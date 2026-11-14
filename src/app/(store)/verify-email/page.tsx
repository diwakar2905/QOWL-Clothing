import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmEmailForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

/**
 * The emailed link only opens this page; the token is consumed by the button
 * (a POST), so mail scanners that prefetch links can't use it up.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Confirm your email" subtitle="One more step to finish setting up your QOWL account.">
      {token ? (
        <ConfirmEmailForm token={token.slice(0, 100)} />
      ) : (
        <p className="text-center text-sm">This link is incomplete. <Link href="/login" className="text-forest underline">Sign in</Link> to request a new one.</p>
      )}
    </AuthShell>
  );
}
