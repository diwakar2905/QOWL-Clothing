import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/session";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { customerStatusLabel } from "@/domain/state-machines";
import { FormMessage } from "@/components/ui/form";
import { ResendVerification } from "@/components/account/resend-verification";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const [orders, full] = await Promise.all([
    db.order.findMany({ where: { userId: user.id, status: { notIn: ["PENDING_PAYMENT", "EXPIRED", "PAYMENT_FAILED"] } }, orderBy: { placedAt: "desc" }, take: 3, include: { items: { select: { id: true } } } }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { status: true } }),
  ]);
  return (
    <div className="space-y-8">
      {welcome && <FormMessage tone="success">Welcome to QOWL. Your account is ready.</FormMessage>}
      {!user.emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <span>Please verify your email address — we sent a link to {user.email}.</span>
          <ResendVerification />
        </div>
      )}
      {full.status === "DELETION_REQUESTED" && <FormMessage tone="info">Your account deletion request is being processed.</FormMessage>}
      <section>
        <div className="mb-4 flex items-center justify-between"><h2 className="label-wide">Recent orders</h2><Link href="/account/orders" className="label link-underline text-forest">View all</Link></div>
        {orders.length === 0 ? (
          <p className="text-sm text-charcoal/75">No orders yet. <Link href="/collections/drop-001" className="text-forest underline">Shop Drop 001</Link>.</p>
        ) : (
          <ul className="divide-y hairline border-y hairline">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/account/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm hover:text-forest">
                  <span className="font-medium">{o.number}</span>
                  <span className="text-charcoal/75">{formatDate(o.placedAt)} · {o.items.length} item{o.items.length === 1 ? "" : "s"}</span>
                  <span>{customerStatusLabel(o)}</span>
                  <span className="tabular-nums">{formatINR(o.grandTotal)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[{ href: "/account/addresses", t: "Addresses", d: "Manage saved delivery addresses" }, { href: "/wishlist", t: "Wishlist", d: "Pieces you've saved" }, { href: "/account/security", t: "Profile & security", d: "Name, phone, password, account deletion" }].map((c) => (
          <Link key={c.href} href={c.href} className="border hairline p-5 hover:border-forest">
            <p className="font-serif text-2xl uppercase">{c.t}</p>
            <p className="mt-1 text-sm text-charcoal/75">{c.d}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
