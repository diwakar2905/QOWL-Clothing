import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "block w-full border border-charcoal/20 bg-white/70 px-3.5 h-12 text-[15px] text-charcoal placeholder:text-stone/70 transition-colors focus:border-forest focus:bg-white focus:outline-none aria-[invalid=true]:border-danger";

type FieldProps = { label: string; error?: string; hint?: ReactNode; optional?: boolean; className?: string; hideLabel?: boolean };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input({ label, error, hint, optional, className, hideLabel, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = [error ? `${inputId}-err` : null, hint ? `${inputId}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={cn("mb-1.5 block text-[13px] font-medium text-charcoal", hideLabel && "sr-only")}>
        {label}
        {optional && <span className="ml-1 font-normal text-stone">(optional)</span>}
      </label>
      <input ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={control} {...rest} />
      {hint && !error && <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-stone">{hint}</p>}
      {error && <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function Textarea({ label, error, hint, optional, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-charcoal">
        {label}
        {optional && <span className="ml-1 font-normal text-stone">(optional)</span>}
      </label>
      <textarea ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-err` : undefined} className={cn(control, "h-auto min-h-28 py-3")} {...rest} />
      {hint && !error && <p className="mt-1.5 text-xs text-stone">{hint}</p>}
      {error && <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function Select({ label, error, optional, className, id, children, hideLabel, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={cn("mb-1.5 block text-[13px] font-medium text-charcoal", hideLabel && "sr-only")}>
        {label}
        {optional && <span className="ml-1 font-normal text-stone">(optional)</span>}
      </label>
      <select ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={error ? `${inputId}-err` : undefined} className={cn(control, "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23262626%22 stroke-width=%221.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-10")} {...rest}>
        {children}
      </select>
      {error && <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }>(function Checkbox({ label, error, className, id, ...rest }, ref) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-charcoal">
        <input ref={ref} id={inputId} type="checkbox" aria-invalid={error ? true : undefined} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-forest" {...rest} />
        <span>{label}</span>
      </label>
      {error && <p role="alert" className="mt-1.5 pl-7 text-xs text-danger">{error}</p>}
    </div>
  );
});

export function FormMessage({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  if (!children) return null;
  const styles = { error: "border-danger/30 bg-danger/5 text-danger", success: "border-success/30 bg-success/5 text-success", info: "border-forest/20 bg-forest/5 text-forest" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("border px-4 py-3 text-sm", styles)}>
      {children}
    </div>
  );
}
