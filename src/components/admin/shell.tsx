"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/misc";
import { Menu, X, ExternalLink } from "@/components/ui/icons";
import {
  LayoutDashboard, ReceiptText, Undo2, Users, Package, Boxes, Library, FolderTree, BadgePercent, PanelsTopLeft, Star, Mail, Settings, ShieldCheck, ScrollText, LogOut, type LucideIcon,
} from "lucide-react";
import { ADMIN_NAV } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard, "/admin/orders": ReceiptText, "/admin/returns": Undo2, "/admin/customers": Users,
  "/admin/products": Package, "/admin/inventory": Boxes, "/admin/collections": Library, "/admin/categories": FolderTree,
  "/admin/discounts": BadgePercent, "/admin/content": PanelsTopLeft, "/admin/reviews": Star, "/admin/newsletter": Mail,
  "/admin/settings": Settings, "/admin/staff": ShieldCheck, "/admin/audit": ScrollText,
};

export function AdminShell({ user, permissions, children, logout }: { user: { name: string | null; email: string; roleName: string | null }; permissions: string[]; children: ReactNode; logout: () => Promise<void> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = ADMIN_NAV.filter((n) => permissions.includes(n.perm));
  const groups = [...new Set(items.map((i) => i.group))];
  const nav = (
    <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-3 pb-1.5 text-[11px] font-medium text-ivory/45">{g}</p>
          <ul className="space-y-0.5">
            {items.filter((i) => i.group === g).map((i) => {
              const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
              const Icon = ICONS[i.href] ?? Package;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                      active ? "bg-ivory text-forest font-medium shadow-sm" : "text-ivory/75 hover:bg-ivory/10 hover:text-ivory",
                    )}
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.7} />
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
  const initials = (user.name ?? user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const sidebar = (
    <div className="haze-soft on-dark flex h-full w-64 flex-col text-ivory">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo tone="cream" className="h-10" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">QOWL</p>
          <p className="text-[11px] text-ivory/60">Admin</p>
        </div>
      </div>
      {nav}
      <div className="m-3 rounded-xl bg-ivory/8 p-3 text-xs ring-1 ring-ivory/10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ivory text-[12px] font-semibold text-forest">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{user.name ?? user.email}</p>
            <p className="truncate text-ivory/60">{user.roleName}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/" target="_blank" className="flex items-center justify-center gap-1.5 rounded-lg bg-ivory/10 px-2 py-1.5 text-ivory/90 hover:bg-ivory/20">Store <ExternalLink className="h-3 w-3" /></Link>
          <form action={logout}><button type="submit" className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ivory/10 px-2 py-1.5 text-ivory/90 hover:bg-ivory/20"><LogOut className="h-3 w-3" /> Sign out</button></form>
        </div>
      </div>
    </div>
  );
  return (
    <div className="admin-ui flex min-h-dvh bg-[#f4f3ef]">
      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-obsidian/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="relative h-full w-64">{sidebar}</div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b hairline bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open admin menu" className="p-1"><Menu className="h-5 w-5" /></button>
          <span className="text-sm font-semibold">QOWL Admin</span>
          {open && <X className="hidden" />}
        </div>
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
