import Link from "next/link";
import { hasPermission, getCurrentUser } from "@/server/auth/session";
import { dashboardMetrics, launchChecklist, lowStock } from "@/server/services/analytics";
import { Card, PageHeader, Stat, Forbidden } from "@/components/admin/ui";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Check, AlertTriangle } from "@/components/ui/icons";

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

export default async function Overview({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await getCurrentUser();
  if (!hasPermission(user, "analytics.read")) {
    return <><PageHeader title={`Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`} description={`Signed in as ${user?.roleName}. Use the menu to get started.`} /></>;
  }
  const sp = await searchParams;
  const to = sp.to ? new Date(`${sp.to}T23:59:59+05:30`) : new Date();
  const days = RANGES[sp.range ?? "30d"] ?? 30;
  const from = sp.from ? new Date(`${sp.from}T00:00:00+05:30`) : new Date(to.getTime() - days * 86400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return <Forbidden />;
  const [m, low, checklist] = await Promise.all([dashboardMetrics(from, to), lowStock(), launchChecklist()]);
  const max = Math.max(1, ...m.series.map((s) => s.total));
  const pendingChecks = checklist.filter((c) => !c.ok);
  return (
    <>
      <PageHeader
        title="Overview"
        description={<>Showing {formatDate(from)} – {formatDate(to)} (IST).</>}
        actions={
          <form className="flex flex-wrap items-center gap-2 text-sm">
            {Object.keys(RANGES).map((r) => (
              <Link key={r} href={`/admin?range=${r}`} className={`border px-3 py-1.5 ${!sp.from && (sp.range ?? "30d") === r ? "border-forest bg-forest text-ivory" : "hairline bg-ivory"}`}>{r}</Link>
            ))}
            <input type="date" name="from" defaultValue={sp.from} className="border hairline bg-ivory px-2 py-1" aria-label="From" />
            <input type="date" name="to" defaultValue={sp.to} className="border hairline bg-ivory px-2 py-1" aria-label="To" />
            <button className="border hairline bg-ivory px-3 py-1.5">Apply</button>
          </form>
        }
      />
      {pendingChecks.length > 0 && (
        <Card title="Launch readiness" className="mb-6 border-warning/40">
          <p className="mb-3 text-sm text-charcoal/80">{pendingChecks.length} of {checklist.length} items still need attention before accepting real orders.</p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-start gap-2">{c.ok ? <Check className="mt-0.5 h-4 w-4 text-success" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />}<span className={c.ok ? "text-stone" : ""}>{c.label}</span></li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net revenue" value={formatINR(m.netRevenue)} hint="Paid/collected order totals (incl. GST & shipping) confirmed in range, minus refunds recorded on them." />
        <Stat label="Paid orders" value={m.paidOrders} hint="Online paid or COD collected." />
        <Stat label="Avg. order value" value={formatINR(m.aov)} hint="Gross paid revenue ÷ paid orders." />
        <Stat label="Units sold" value={m.unitsSold} hint="Units on paid/collected orders." />
        <Stat label="Awaiting fulfillment" value={<Link href="/admin/orders?view=fulfil" className="hover:text-forest">{m.pendingFulfillment}</Link>} hint="Confirmed, not yet shipped (all time)." />
        <Stat label="Open returns" value={<Link href="/admin/returns" className="hover:text-forest">{m.openReturns}</Link>} hint="All time." />
        <Stat label="Refunds processed" value={formatINR(m.refundsProcessed)} hint={`${m.refundCount} refund(s) confirmed in range.`} />
        <Stat label="Payment failures" value={m.paymentFailures} hint="Failed gateway payment attempts in range." />
      </div>
      {(m.needsAttention > 0 || m.codPending.count > 0) && (
        <p className="mt-3 text-sm">
          {m.needsAttention > 0 && <Link href="/admin/orders?status=ON_HOLD" className="mr-4 text-warning underline">{m.needsAttention} order(s) on hold or awaiting cancellation review</Link>}
          {m.codPending.count > 0 && <span className="text-stone">{m.codPending.count} COD order(s) worth {formatINR(m.codPending.amount)} not yet collected (excluded from revenue).</span>}
        </p>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Daily paid revenue (IST)">
          {m.series.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone">No paid orders in this period.</p>
          ) : (
            <div className="flex h-48 items-end gap-1" role="img" aria-label="Daily revenue bar chart">
              {m.series.map((s) => (
                <div key={s.day.toISOString()} className="group relative flex-1" style={{ height: `${Math.max(4, (s.total / max) * 100)}%` }}>
                  <div className="h-full w-full bg-forest/80 group-hover:bg-forest" />
                  <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap bg-obsidian px-2 py-1 text-[11px] text-ivory group-hover:block">{formatDate(s.day)} · {formatINR(s.total)} · {s.orders} orders</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Top products (units)">
          {m.topProducts.length === 0 ? <p className="text-sm text-stone">No sales yet.</p> : (
            <ol className="space-y-2 text-sm">{m.topProducts.map((t) => <li key={t.name} className="flex justify-between"><span>{t.name}</span><span className="tabular-nums text-stone">{t.units} · {formatINR(t.revenue)}</span></li>)}</ol>
          )}
        </Card>
      </div>
      <Card title="Low stock" className="mt-6" actions={<Link href="/admin/inventory?low=1" className="label text-forest">Inventory →</Link>}>
        {low.length === 0 ? <p className="text-sm text-stone">No active variants at or below their low-stock threshold.</p> : (
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {low.map((l) => <li key={l.sku} className="flex justify-between border hairline px-3 py-2"><span>{l.productName} — {l.color} / {l.size}</span><span className={l.available <= 0 ? "text-danger" : "text-warning"}>{l.available} left</span></li>)}
          </ul>
        )}
      </Card>
    </>
  );
}
