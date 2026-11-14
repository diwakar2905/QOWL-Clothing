"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/account/preferences", label: "Preferences" },
  { href: "/account/security", label: "Profile & security" },
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-2 lg:flex-col lg:gap-0">
        {LINKS.map((l) => {
          const active = l.href === "/account" ? path === "/account" : path.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={active ? "page" : undefined} className={cn("block whitespace-nowrap border px-4 py-2 text-sm lg:border-0 lg:border-l-2 lg:px-4 lg:py-2.5", active ? "border-forest text-forest" : "hairline text-charcoal hover:text-forest lg:border-transparent")}>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
