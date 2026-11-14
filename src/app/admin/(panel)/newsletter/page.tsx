import { db } from "@/lib/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Table, Td, Status, Stat } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Newsletter" };

export default async function NewsletterAdmin() {
  await requirePermission("newsletter.export");
  const [subs, counts] = await Promise.all([db.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 200 }), db.newsletterSubscriber.groupBy({ by: ["status"], _count: true })]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader title="Newsletter" description="Consent text and timestamp are recorded for every subscriber." actions={<a href="/api/admin/newsletter/export" className="label border hairline bg-ivory px-3 py-2">Export CSV</a>} />
      <div className="mb-6 grid grid-cols-3 gap-3"><Stat label="Subscribed" value={c("SUBSCRIBED")} /><Stat label="Pending confirmation" value={c("PENDING")} /><Stat label="Unsubscribed" value={c("UNSUBSCRIBED")} /></div>
      <Table head={["Email", "Status", "Consent", "Source"]} empty={subs.length ? undefined : "No subscribers yet."}>
        {subs.map((s) => <tr key={s.id}><Td>{s.email}</Td><Td><Status value={s.status} /></Td><Td className="text-xs">{formatDateTime(s.consentAt)}</Td><Td>{s.source ?? "—"}</Td></tr>)}
      </Table>
    </>
  );
}
