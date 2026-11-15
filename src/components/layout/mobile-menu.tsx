"use client";

import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { useStore } from "@/components/providers/store";
import { ArrowRight } from "@/components/ui/icons";
import type { NavLink } from "./header";

export function MobileMenu({ open, onClose, links, secondary, side = "left" }: { open: boolean; onClose: () => void; links: NavLink[]; secondary: NavLink[]; side?: "left" | "right" }) {
  const { user } = useStore();
  return (
    <Dialog open={open} onClose={onClose} title="Menu" variant="drawer" side={side}>
      <nav aria-label="Menu" className="flex min-h-full flex-col px-6 py-6">
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={onClose} className="group flex items-center justify-between border-b hairline py-4 font-serif text-[1.7rem] uppercase leading-none text-obsidian">
                {l.label}
                <ArrowRight className="h-5 w-5 -translate-x-2 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" strokeWidth={1.3} />
              </Link>
            </li>
          ))}
        </ul>
        <ul className="mt-8 space-y-3 text-sm">
          <li>
            <Link href={user ? "/account" : "/login"} onClick={onClose} className="link-underline">
              {user ? "My account" : "Sign in / Create account"}
            </Link>
          </li>
          <li>
            <Link href="/wishlist" onClick={onClose} className="link-underline">Wishlist</Link>
          </li>
          <li>
            <Link href="/orders/track" onClick={onClose} className="link-underline">Track an order</Link>
          </li>
          <li>
            <Link href="/our-story" onClick={onClose} className="link-underline">Our story</Link>
          </li>
          <li>
            <Link href="/contact" onClick={onClose} className="link-underline">Contact us</Link>
          </li>
          {secondary.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={onClose} className="link-underline">{l.label}</Link>
            </li>
          ))}
        </ul>
        <p className="label-wide mt-auto pt-10 text-forest">Wear your own code.</p>
      </nav>
    </Dialog>
  );
}
