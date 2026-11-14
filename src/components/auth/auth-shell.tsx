import type { ReactNode } from "react";
import { Sparkle } from "@/components/ui/icons";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-14 sm:py-20">
      <Sparkle className="mx-auto h-4 w-4 text-forest" />
      <h1 className="display mt-4 text-center text-5xl text-obsidian">{title}</h1>
      {subtitle && <p className="mt-3 text-center text-sm text-charcoal/80">{subtitle}</p>}
      <div className="mt-10">{children}</div>
    </div>
  );
}
