import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "./icons";

type Variant = "primary" | "outline" | "ghost" | "light" | "outline-light" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2.5 label whitespace-nowrap transition-[background-color,color,border-color,opacity,transform] duration-300 ease-[var(--ease-editorial)] disabled:opacity-50 disabled:pointer-events-none select-none";
const variants: Record<Variant, string> = {
  primary: "bg-forest text-ivory hover:bg-forest-deep border border-forest",
  outline: "border border-charcoal/30 text-charcoal hover:border-forest hover:text-forest bg-transparent",
  ghost: "text-charcoal hover:text-forest",
  light: "bg-ivory text-forest hover:bg-cream border border-ivory",
  "outline-light": "border border-ivory/60 text-ivory hover:bg-ivory hover:text-forest on-dark",
  danger: "bg-danger text-ivory hover:opacity-90 border border-danger",
};
const sizes: Record<Size, string> = { sm: "h-9 px-4", md: "h-11 px-6", lg: "h-13 px-8 min-h-[3.25rem]" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
      {!loading && icon}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", size = "md", className, children, icon }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
      {icon}
    </Link>
  );
}
