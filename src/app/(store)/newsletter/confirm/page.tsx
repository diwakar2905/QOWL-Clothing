import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { confirmSubscription } from "@/server/services/newsletter";

export const metadata: Metadata = { title: "Confirm subscription", robots: { index: false } };

export default async function ConfirmNewsletter({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await confirmSubscription(token) : false;
  return (
    <AuthShell title={ok ? "You're in" : "Link expired"} subtitle={ok ? "Welcome to the QOWL world. You'll hear about new drops first." : "This confirmation link is invalid or was already used."}>
      <div className="flex justify-center"><ButtonLink href="/">Continue</ButtonLink></div>
    </AuthShell>
  );
}
