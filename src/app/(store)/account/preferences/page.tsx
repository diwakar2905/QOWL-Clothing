import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/session";
import { PreferencesForm } from "@/components/account/forms";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Preferences", robots: { index: false } };

export default async function PreferencesPage() {
  const user = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { marketingOptIn: true, marketingConsentAt: true } });
  const sub = await db.newsletterSubscriber.findUnique({ where: { email: user.email }, select: { status: true } });
  return (
    <div className="max-w-xl">
      <h2 className="label-wide mb-4">Communication preferences</h2>
      <p className="mb-4 text-sm text-charcoal/80">Order, shipping and account emails are always sent. Marketing emails are optional.</p>
      <PreferencesForm optIn={u.marketingOptIn} />
      <p className="mt-4 text-xs text-stone">{u.marketingConsentAt ? `Last updated ${formatDate(u.marketingConsentAt)}.` : "No marketing consent recorded."} {sub && `Newsletter status: ${sub.status.toLowerCase()}.`}</p>
    </div>
  );
}
