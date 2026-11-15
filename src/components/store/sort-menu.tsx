"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "@/components/ui/icons";

type Option = { v: string; l: string };

/**
 * Brand-styled sort dropdown (replaces the native <select>, whose open list is
 * drawn by the OS with its own blue highlight). Accessible listbox pattern:
 * ↑/↓/Home/End move, Enter/Space choose, Esc or a click outside closes.
 */
export function SortMenu({ value, options, onChange }: { value: string; options: Option[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const selected = Math.max(0, options.findIndex((o) => o.v === value));

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const openMenu = () => {
    setActive(selected);
    setOpen(true);
  };

  const choose = (i: number) => {
    setOpen(false);
    button.current?.focus();
    if (options[i] && options[i].v !== value) onChange(options[i].v);
  };

  return (
    <div ref={root} className="relative flex items-center gap-2 text-sm">
      <span id={`${id}-label`} className="text-charcoal/75">Sort by:</span>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openMenu(); } }}
        className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-0.5 font-medium text-obsidian hover:text-forest"
      >
        <span id={`${id}-value`}>{options[selected]?.l}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} strokeWidth={1.6} />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Home") { e.preventDefault(); setActive(0); }
            else if (e.key === "End") { e.preventDefault(); setActive(options.length - 1); }
            else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
            else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); button.current?.focus(); }
          }}
          className="absolute left-0 top-full z-30 mt-2 min-w-[13rem] sm:left-auto sm:right-0 overflow-hidden rounded-xl border border-charcoal/10 bg-ivory p-1.5 shadow-[0_12px_32px_-12px_rgba(23,23,23,0.35)] outline-none animate-fade"
        >
          {options.map((o, i) => (
            <li
              key={o.v || "featured"}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === selected}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-6 rounded-lg px-3 py-2.5 text-[13.5px] text-charcoal",
                i === active && "bg-forest/[0.07] text-forest",
                i === selected && "font-medium text-forest",
              )}
            >
              {o.l}
              {i === selected && <Check className="h-4 w-4" strokeWidth={2} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
