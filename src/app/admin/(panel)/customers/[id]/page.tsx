import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, hasPermission, requirePermission } from "@/server/auth/session";
import { PageHeader, Card, Status } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/client";
import { CustomerForm } from "@/components/admin/forms";
import { anonymiseCustomerAction } from "@/server/actions/admin/operations";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Customer" };

export default async function CustomerAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("customers.read");
  const user = await getCurrentUser();
  const pii = hasPermission(user, "customers.pii");
  const { id } = await params;
  const c = await db.user.findFirst({ where: { id, roleId: null }, include: { orders: { orderBy: { placedAt: "desc" }, take: 50 }, addresses: pii, _count: { select: { reviews: true } } } });
  if (!c) notFound();
  const spent = c.orders.filter((o) => ["PAID", "PARTIALLY_REFUNDED", "COD_COLLECTED"].includes(o.paymentStatus)).reduce((s, o) => s + o.grandTotal - o.refundedTotal, 0);
  return (
    <>
      <PageHeader title={c.name ?? "Customer"} back={{ href: "/admin/customers", label: "Customers" }} description={<span className="flex items-center gap-2"><Status value={c.status} /> Joined {formatDate(c.createdAt)} · {c.orders.length} orders · {formatINR(spent)} net paid</span>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card title="Orders">
          {c.orders.length === 0 ? <p className="text-sm text-stone">No orders.</p> : <ul className="divide-y hairline text-sm">{c.orders.map((o) => <li key={o.id} className="flex justify-between py-2"><Link href={`/admin/orders/${o.id}`} className="text-forest">{o.number}</Link><span className="text-stone">{formatDateTime(o.placedAt)}</span><Status value={o.status} /><span>{formatINR(o.grandTotal)}</span></li>)}</ul>}
        </Card>
        <div className="space-y-6">
          <Card title="Contact">
            {pii ? <p className="text-sm">{c.email}<br />{c.phone ?? "No phone"}<br />Email {c.emailVerifiedAt ? "verified" : "not verified"}<br />Marketing: {c.marketingOptIn ? `opted in ${c.marketingConsentAt ? formatDate(c.marketingConsentAt) : ""}` : "not opted in"}</p> : <p className="text-sm text-stone">Hidden for your role.</p>}
          </Card>
          {pii && <Card title="Saved addresses">{c.addresses.length ? c.addresses.map((a) => <p key={a.id} className="mb-2 text-sm">{a.fullName}, {a.line1}, {a.city}, {a.state} {a.pincode}</p>) : <p className="text-sm text-stone">None.</p>}</Card>}
          {hasPermission(user, "customers.update") && (
            <Card title="Account">
              <CustomerForm id={c.id} status={c.status === "DELETED" ? "ACTIVE" : c.status} notes={c.supportNotes ?? ""} />
              {c.status === "DELETION_REQUESTED" && <div className="mt-4 border-t hairline pt-4"><p className="mb-2 text-xs text-stone">Deletion requested {c.deletionRequestedAt && formatDate(c.deletionRequestedAt)}. Anonymising removes profile, addresses, wishlist and bag; orders are retained without identity.</p><ActionButton variant="danger" confirm="Permanently anonymise this account?" action={() => anonymiseCustomerAction(c.id)}>Anonymise account</ActionButton></div>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
