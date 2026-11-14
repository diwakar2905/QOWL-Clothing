import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { unsubscribe } from "@/server/services/newsletter";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await unsubscribe(token) : false;
  return (
    <AuthShell title={ok ? "Unsubscribed" : "Link not recognised"} subtitle={ok ? "You won't receive marketing emails from us anymore. Order emails are unaffected." : "This unsubscribe link is invalid. Contact customer care if you keep receiving emails."}>
      <div className="flex justify-center"><ButtonLink href="/" variant="outline">Back to QOWL</ButtonLink></div>
    </AuthShell>
  );
}
