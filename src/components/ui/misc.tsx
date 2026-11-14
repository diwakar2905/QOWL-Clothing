import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/money";
import { Sparkle } from "./icons";

export function Logo({ tone = "cream", className, priority }: { tone?: "cream" | "forest"; className?: string; priority?: boolean }) {
  return (
    <Image
      src={tone === "cream" ? "/brand/logo-cream.png" : "/brand/logo-forest.png"}
      alt="QOWL"
      width={435}
      height={705}
      priority={priority}
      className={cn("w-auto object-contain", className)}
    />
  );
}

export function Price({ price, mrp, className }: { price: number; mrp?: number | null; className?: string }) {
  const discounted = mrp != null && mrp > price;
  return (
    <span className={cn("inline-flex items-baseline gap-2 tabular-nums", className)}>
      <span>{formatINR(price)}</span>
      {discounted && (
        <>
          <span className="text-[0.85em] text-current/60 line-through decoration-1" aria-label={`MRP ${formatINR(mrp!)}`}>
            {formatINR(mrp!)}
          </span>
          <span className="sr-only">Sale price</span>
        </>
      )}
    </span>
  );
}

/** Editorial heading with hairline + four-point star ornaments. */
export function SectionHeading({ eyebrow, title, subtitle, as: Tag = "h2", tone = "dark", className }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; as?: "h1" | "h2"; tone?: "dark" | "light"; className?: string }) {
  const line = tone === "dark" ? "bg-forest/40" : "bg-ivory/40";
  return (
    <div className={cn("text-center", className)}>
      {eyebrow && <p className={cn("label-wide mb-3", tone === "dark" ? "text-charcoal/80" : "text-ivory/80")}>{eyebrow}</p>}
      <div className="flex items-center justify-center gap-5 sm:gap-8">
        <span aria-hidden className="hidden items-center gap-3 sm:flex">
          <span className={cn("h-px w-16 lg:w-28", line)} />
          <Sparkle className={cn("h-3.5 w-3.5", tone === "dark" ? "text-forest" : "text-ivory")} />
        </span>
        <Tag className={cn("display text-[2.4rem] sm:text-5xl lg:text-[3.6rem]", tone === "dark" ? "text-obsidian" : "text-ivory")}>{title}</Tag>
        <span aria-hidden className="hidden items-center gap-3 sm:flex">
          <Sparkle className={cn("h-3.5 w-3.5", tone === "dark" ? "text-forest" : "text-ivory")} />
          <span className={cn("h-px w-16 lg:w-28", line)} />
        </span>
      </div>
      {subtitle && <p className={cn("mt-3 font-serif text-lg italic sm:text-xl", tone === "dark" ? "text-charcoal/80" : "text-ivory/85")}>{subtitle}</p>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.label, ...(it.href ? { item: it.href } : {}) })),
  };
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-charcoal/70">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href && i < items.length - 1 ? (
              <Link href={it.href} className="link-underline hover:text-forest">
                {it.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="text-charcoal">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <JsonLd data={ld} />
    </nav>
  );
}

/** Safely serialise structured data (escapes </script> breakouts). */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function ConceptBadge({ className, text = "Concept render" }: { className?: string; text?: string }) {
  return (
    <span className={cn("pointer-events-none inline-flex items-center bg-obsidian/70 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-ivory backdrop-blur-sm", className)} title="Concept imagery — not a photograph of the final garment">
      {text}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "forest" | "danger" | "warning" | "success"; className?: string }) {
  const tones = {
    neutral: "bg-soft text-charcoal",
    forest: "bg-forest text-ivory",
    danger: "bg-danger/10 text-danger",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
  };
  return <span className={cn("inline-flex items-center px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider", tones[tone], className)}>{children}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <Sparkle className="mx-auto mb-5 h-5 w-5 text-forest" />
      <h2 className="display text-3xl text-obsidian">{title}</h2>
      {body && <div className="mt-3 text-sm leading-relaxed text-charcoal/75">{body}</div>}
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10", className)}>{children}</div>;
}
