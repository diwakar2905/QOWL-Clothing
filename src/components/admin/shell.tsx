"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/misc";
import { Menu, X, ExternalLink } from "@/components/ui/icons";
import { ADMIN_NAV } from "./nav";

export function AdminShell({ user, permissions, children, logout }: { user: { name: string | null; email: string; roleName: string | null }; permissions: string[]; children: ReactNode; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = ADMIN_NAV.filter((n) => permissions.includes(n.perm));
  const groups = [...new Set(items.map((i) => i.group))];
  const nav = (
    <nav aria-label="Admin" className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ivory/50">{g}</p>
          <ul>
            {items.filter((i) => i.group === g).map((i) => {
              const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("block rounded-sm px-3 py-2 text-sm", active ? "bg-ivory/12 text-ivory" : "text-ivory/75 hover:bg-ivory/5 hover:text-ivory")}>
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  const sidebar = (
    <div className="haze-soft on-dark flex h-full w-64 flex-col text-ivory">
      <div className="flex items-center gap-3 border-b border-ivory/10 px-5 py-4">
        <Logo tone="cream" className="h-10" />
        <span className="label text-ivory/80">Admin</span>
      </div>
      {nav}
      <div className="border-t border-ivory/10 p-4 text-xs">
        <p className="truncate font-medium">{user.name ?? user.email}</p>
        <p className="text-ivory/60">{user.roleName}</p>
        <div className="mt-3 flex items-center justify-between">
          <Link href="/" target="_blank" className="flex items-center gap-1 text-ivory/80 hover:text-ivory">Storefront <ExternalLink className="h-3 w-3" /></Link>
          <form action={logout}><button type="submit" className="text-ivory/80 hover:text-ivory">Sign out</button></form>
        </div>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-dvh bg-[#f3f1ea]">
      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-obsidian/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 border-b hairline bg-ivory px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open admin menu" className="p-1"><Menu className="h-5 w-5" /></button>
          <span className="label">QOWL Admin</span>
          {open && <X className="hidden" />}
        </div>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
