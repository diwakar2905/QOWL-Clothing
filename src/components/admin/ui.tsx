import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { humanise } from "@/domain/state-machines";

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && <Link href={back.href} className="mb-2 inline-block text-xs text-stone hover:text-forest">← {back.label}</Link>}
        <h1 className="font-serif text-4xl uppercase leading-none text-obsidian">{title}</h1>
        {description && <div className="mt-2 text-sm text-charcoal/75">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("border hairline bg-ivory p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="label-wide text-charcoal">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  PAID: "bg-success/10 text-success", CONFIRMED: "bg-success/10 text-success", ACTIVE: "bg-success/10 text-success", DELIVERED: "bg-success/10 text-success", COMPLETED: "bg-success/10 text-success", PROCESSED: "bg-success/10 text-success", APPROVED: "bg-success/10 text-success", SUBSCRIBED: "bg-success/10 text-success", SENT: "bg-success/10 text-success", COD_COLLECTED: "bg-success/10 text-success",
  PENDING_PAYMENT: "bg-warning/10 text-warning", PENDING: "bg-warning/10 text-warning", ON_HOLD: "bg-warning/15 text-warning", DRAFT: "bg-soft text-charcoal", REQUESTED: "bg-warning/10 text-warning", CANCELLATION_REQUESTED: "bg-warning/15 text-warning", COD_PENDING: "bg-warning/10 text-warning", REFUND_PENDING: "bg-warning/10 text-warning",
  PAYMENT_FAILED: "bg-danger/10 text-danger", FAILED: "bg-danger/10 text-danger", CANCELLED: "bg-danger/10 text-danger", REJECTED: "bg-danger/10 text-danger", EXPIRED: "bg-soft text-stone", ARCHIVED: "bg-soft text-stone", SUSPENDED: "bg-danger/10 text-danger", REFUNDED: "bg-soft text-charcoal",
};

export function Status({ value }: { value: string }) {
  return <span className={cn("inline-flex whitespace-nowrap px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", TONES[value] ?? "bg-forest/10 text-forest")}>{humanise(value)}</span>;
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto border hairline bg-ivory">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b hairline bg-cream/60 text-left">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-charcoal/80">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y hairline">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-stone">{empty}</p>}
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top", className)}>{children}</td>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border hairline bg-ivory p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone">{label}</p>
      <p className="mt-1 font-serif text-3xl text-obsidian tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone">{hint}</p>}
    </div>
  );
}

export function Forbidden() {
  return <div className="border hairline bg-ivory p-10 text-center text-sm">You don&apos;t have permission to view this page.</div>;
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)} className="border hairline px-3 py-1.5 hover:border-forest">Previous</Link>}
      <span className="text-stone">Page {page} of {pages}</span>
      {page < pages && <Link href={href(page + 1)} className="border hairline px-3 py-1.5 hover:border-forest">Next</Link>}
    </nav>
  );
}
