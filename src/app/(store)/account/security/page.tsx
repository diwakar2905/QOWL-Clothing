import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/session";
import { ProfileForm, PasswordForm, DeletionForm } from "@/components/account/forms";
import { signOutEverywhereAction } from "@/server/actions/account";

export const metadata: Metadata = { title: "Profile & security", robots: { index: false } };

export default async function SecurityPage() {
  const user = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, phone: true, marketingOptIn: true, passwordHash: true, status: true } });
  return (
    <div className="max-w-xl space-y-12">
      <section><h2 className="label-wide mb-4">Profile</h2><ProfileForm name={u.name ?? ""} phone={u.phone ?? ""} marketingOptIn={u.marketingOptIn} email={user.email} /></section>
      {u.passwordHash && <section><h2 className="label-wide mb-4">Change password</h2><PasswordForm /></section>}
      <section>
        <h2 className="label-wide mb-2">Sessions</h2>
        <form action={signOutEverywhereAction}><button className="label link-underline" type="submit">Sign out of all devices</button></form>
      </section>
      <section className="border-t hairline pt-8">
        <h2 className="label-wide mb-2 text-danger">Delete account</h2>
        <p className="mb-4 text-sm text-charcoal/80">We&apos;ll remove your profile, addresses, wishlist and bag. Order and invoice records we&apos;re legally required to keep are retained and anonymised where possible.</p>
        {u.status === "DELETION_REQUESTED" ? <p className="text-sm">Your deletion request is being processed.</p> : <DeletionForm />}
      </section>
    </div>
  );
}
