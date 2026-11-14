import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Status } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/client";
import { moderateReviewAction } from "@/server/actions/admin/operations";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Reviews" };

export default async function ReviewsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("reviews.moderate");
  const status = ((await searchParams).status ?? "PENDING") as "PENDING";
  const reviews = await db.review.findMany({ where: status === ("REPORTED" as string) ? { reportCount: { gt: 0 } } : { status }, orderBy: { createdAt: "desc" }, take: 100, include: { product: { select: { name: true } }, user: { select: { name: true } }, reports: true } });
  return (
    <>
      <PageHeader title="Reviews" description="Only verified purchasers can submit reviews. Nothing is published until approved." actions={<div className="flex gap-2 text-sm">{["PENDING", "APPROVED", "REJECTED", "REPORTED"].map((s) => <a key={s} href={`/admin/reviews?status=${s}`} className={`border px-3 py-1.5 ${status === s ? "border-forest bg-forest text-ivory" : "hairline bg-ivory"}`}>{s.toLowerCase()}</a>)}</div>} />
      {reviews.length === 0 && <p className="border hairline bg-ivory p-8 text-center text-sm text-stone">Nothing here.</p>}
      <ul className="space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="border hairline bg-ivory p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><p><strong>{r.product.name}</strong> · {r.rating}/5 · {r.user.name ?? "Customer"} · {formatDate(r.createdAt)} {r.isVerifiedPurchase && "· verified"}</p><Status value={r.status} /></div>
            {r.title && <p className="mt-2 font-medium">{r.title}</p>}
            <p className="mt-1">{r.body}</p>
            {r.reports.length > 0 && <p className="mt-2 text-xs text-danger">Reported {r.reports.length}×: {r.reports.map((x) => x.reason).join("; ")}</p>}
            <div className="mt-3 flex gap-2">
              {r.status !== "APPROVED" && <ActionButton variant="primary" action={moderateReviewAction.bind(null, r.id, "APPROVED")}>Approve</ActionButton>}
              {r.status !== "REJECTED" && <ActionButton variant="danger" action={moderateReviewAction.bind(null, r.id, "REJECTED")}>Reject</ActionButton>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
