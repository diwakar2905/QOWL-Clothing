"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/misc";
import { Heart, Menu, Search, ShoppingBag, User } from "@/components/ui/icons";
import { useStore } from "@/components/providers/store";
import { MobileMenu } from "./mobile-menu";
import { SearchOverlay } from "./search-overlay";
import { CartDrawer } from "./cart-drawer";

export type NavLink = { label: string; href: string };

export function Header({ links, secondary }: { links: NavLink[]; secondary: NavLink[] }) {
  const pathname = usePathname();
  const overlay = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { cartCount, setDrawerOpen, user } = useStore();

  // Close any overlay when the route changes (client-side navigation keeps state).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
    setSearchOpen(false);
  }
  useEffect(() => setDrawerOpen(false), [pathname, setDrawerOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keyboard shortcut: "/" opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const transparent = overlay && !scrolled && !menuOpen;
  const iconBtn = "relative inline-flex h-11 w-11 items-center justify-center text-ivory transition-opacity hover:opacity-75";
  // NB: cn() uses tailwind-merge so "hidden sm:inline-flex" correctly overrides the base display.

  return (
    <>
      <header
        className={cn(
          "on-dark sticky top-0 z-50 transition-[background-color,box-shadow] duration-500",
          overlay && "-mb-[var(--header-h)]",
          transparent ? "bg-transparent" : "haze-soft shadow-[0_1px_0_rgba(247,244,236,0.08)]",
        )}
        style={{ ["--header-h" as string]: "84px" }}
      >
        <div className="mx-auto grid h-[68px] max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4 lg:h-[84px] lg:px-8">
          <nav aria-label="Primary" className="flex items-center">
            <button type="button" className={cn(iconBtn, "lg:hidden")} aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <Menu className="h-[22px] w-[22px]" strokeWidth={1.4} />
            </button>
            <ul className="hidden items-center gap-7 lg:flex xl:gap-9">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={cn("link-underline py-1 text-[13px] font-medium tracking-wide text-ivory", pathname === l.href && "bg-[length:100%_1px]")} aria-current={pathname === l.href ? "page" : undefined}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link href="/" aria-label="QOWL home" className="flex justify-center">
            <Logo tone="cream" priority className="h-[52px] lg:h-[66px]" />
          </Link>
          <div className="flex items-center justify-end">
            <button type="button" className={iconBtn} aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search className="h-5 w-5" strokeWidth={1.4} />
            </button>
            <Link href={user ? (user.isStaff ? "/admin" : "/account") : "/login"} className={cn(iconBtn, "hidden sm:inline-flex")} aria-label={user ? "Your account" : "Sign in"}>
              <User className="h-5 w-5" strokeWidth={1.4} />
            </Link>
            <Link href="/wishlist" className={cn(iconBtn, "hidden sm:inline-flex")} aria-label="Wishlist">
              <Heart className="h-5 w-5" strokeWidth={1.4} />
            </Link>
            <button type="button" className={iconBtn} aria-label={`Shopping bag, ${cartCount} item${cartCount === 1 ? "" : "s"}`} onClick={() => setDrawerOpen(true)}>
              <ShoppingBag className="h-5 w-5" strokeWidth={1.4} />
              <span aria-hidden className={cn("absolute right-1.5 top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-ivory px-1 text-[10px] font-semibold text-forest", cartCount === 0 && "opacity-80")}>
                {cartCount}
              </span>
            </button>
            <button type="button" className={cn(iconBtn, "hidden lg:inline-flex")} aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <Menu className="h-[22px] w-[22px]" strokeWidth={1.4} />
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} links={links} secondary={secondary} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartDrawer />
    </>
  );
}
