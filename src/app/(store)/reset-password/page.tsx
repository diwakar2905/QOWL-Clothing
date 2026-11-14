import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="New password">
      {token ? <ResetForm token={token.slice(0, 100)} /> : <p className="text-center text-sm">This link is incomplete. <Link href="/forgot-password" className="text-forest underline">Request a new one</Link>.</p>}
    </AuthShell>
  );
}
