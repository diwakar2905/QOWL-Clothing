import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { verifyEmail } from "@/server/services/auth";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false;
  let message = "This verification link is invalid or has expired.";
  if (token) {
    try {
      await verifyEmail(token);
      ok = true;
    } catch (e) {
      message = (e as Error).message;
    }
  }
  return (
    <AuthShell title={ok ? "Email verified" : "Link expired"} subtitle={ok ? "Thanks — your email address is confirmed." : message}>
      <div className="flex justify-center"><ButtonLink href="/account">Go to your account</ButtonLink></div>
    </AuthShell>
  );
}
