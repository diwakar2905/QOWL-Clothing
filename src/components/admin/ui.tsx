import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { humanise } from "@/domain/state-machines";

export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-2 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-charcoal/80 ring-1 ring-charcoal/10 hover:text-forest">← {back.label}</Link>}
        <h1 className="font-sans text-[28px] font-semibold leading-tight tracking-tight text-obsidian">{title}</h1>
        {description && <div className="mt-1 max-w-3xl text-sm text-charcoal/65">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(23,23,23,0.04)] ring-1 ring-charcoal/[0.07] sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-sans text-[15px] font-semibold text-obsidian">{title}</h2>}
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
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium", TONES[value] ?? "bg-forest/10 text-forest")}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {humanise(value)}
    </span>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_2px_rgba(23,23,23,0.04)] ring-1 ring-charcoal/[0.07]">
      <table className="admin-table w-full min-w-[640px] text-sm">
        <thead className="border-b border-charcoal/[0.07] bg-[#faf9f6] text-left">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 text-[12px] font-medium text-charcoal/60">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-charcoal/[0.06]">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-12 text-center text-sm text-stone">{empty}</p>}
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3.5 align-middle", className)}>{children}</td>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(23,23,23,0.04)] ring-1 ring-charcoal/[0.07]">
      <p className="text-[13px] text-charcoal/60">{label}</p>
      <p className="mt-1.5 font-sans text-[26px] font-semibold tracking-tight text-obsidian tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-stone">{hint}</p>}
    </div>
  );
}

export function Forbidden() {
  return <div className="rounded-2xl bg-white p-10 text-center text-sm ring-1 ring-charcoal/[0.07]">You don&apos;t have permission to view this page.</div>;
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-charcoal/10 hover:ring-forest">Previous</Link>}
      <span className="text-stone">Page {page} of {pages}</span>
      {page < pages && <Link href={href(page + 1)} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-charcoal/10 hover:ring-forest">Next</Link>}
    </nav>
  );
}
