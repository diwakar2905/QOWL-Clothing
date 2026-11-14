"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { X } from "./icons";

/**
 * Accessible modal/drawer built on the native <dialog> element: focus is
 * trapped, Escape closes, and focus returns to the opener automatically.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  variant = "modal",
  side = "right",
  className,
  hideTitle,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: "modal" | "drawer";
  side?: "left" | "right";
  className?: string;
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-ivory p-0 text-charcoal backdrop:bg-obsidian/55 backdrop:backdrop-blur-[2px] open:animate-fade",
        variant === "drawer"
          ? cn("fixed top-0 h-dvh w-full sm:w-[440px]", side === "right" ? "right-0 left-auto open:animate-drawer-in" : "left-0 right-auto open:animate-drawer-in-left")
          : "fixed inset-0 m-auto h-fit max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-auto",
        className,
      )}
    >
      {open && (
        <div className={cn("flex h-full flex-col", variant === "drawer" && "h-dvh")}>
          <div className={cn("flex items-center justify-between border-b hairline px-5 py-4 sm:px-6", hideTitle && "sr-only")}>
            <h2 className="label-wide text-charcoal">{title}</h2>
            <button type="button" onClick={onClose} className="-mr-2 p-2 text-charcoal hover:text-forest" aria-label="Close">
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>
          {hideTitle && (
            <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 bg-ivory/90 p-2 text-charcoal hover:text-forest" aria-label="Close">
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}
