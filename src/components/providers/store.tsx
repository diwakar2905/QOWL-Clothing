"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiCallError } from "@/lib/client-api";
import { useToast } from "@/components/ui/toast";
import type { CartView } from "@/server/services/cart";

type SessionInfo = { name: string | null; email: string; isStaff: boolean } | null;

type StoreCtx = {
  user: SessionInfo;
  cart: CartView | null;
  cartCount: number;
  cartLoading: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  refreshCart: () => Promise<CartView | null>;
  addToCart: (variantId: string, quantity: number, opts?: { openDrawer?: boolean }) => Promise<boolean>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<string | null>;
  removeCoupon: () => Promise<void>;
  reconcile: () => Promise<void>;
  wishlist: Set<string>;
  wishlistReady: boolean;
  toggleWishlist: (productId: string) => Promise<void>;
};

const Ctx = createContext<StoreCtx | null>(null);
const GUEST_WL = "qowl.wishlist.v1";

function readGuestWishlist(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(GUEST_WL) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}

export function StoreProvider({ children, user, initialCount }: { children: ReactNode; user: SessionInfo; initialCount: number }) {
  const { push } = useToast();
  const [cart, setCart] = useState<CartView | null>(null);
  const [cartCount, setCartCount] = useState(initialCount);
  const [cartLoading, setCartLoading] = useState(false);
  const [drawerOpen, setDrawerOpenState] = useState(false);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [wishlistReady, setWishlistReady] = useState(false);

  const refreshCart = useCallback(async () => {
    setCartLoading(true);
    try {
      const c = await api<CartView>("/api/cart");
      setCart(c);
      setCartCount(c.count);
      return c;
    } catch (e) {
      push("error", (e as Error).message);
      return null;
    } finally {
      setCartLoading(false);
    }
  }, [push]);

  const setDrawerOpen = useCallback(
    (v: boolean) => {
      setDrawerOpenState(v);
      if (v) void refreshCart();
    },
    [refreshCart],
  );

  // Wishlist: server-backed when signed in (merging any guest list), localStorage otherwise.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (user && !user.isStaff) {
        const guest = readGuestWishlist();
        try {
          if (guest.length) {
            await api("/api/wishlist/merge", { body: { productIds: guest } });
            localStorage.removeItem(GUEST_WL);
          }
          const ids = await api<string[]>("/api/wishlist");
          if (!cancelled) setWishlist(new Set(ids));
        } catch {}
      } else if (!cancelled) setWishlist(new Set(readGuestWishlist()));
      if (!cancelled) setWishlistReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handle = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refreshCart();
        return true;
      } catch (e) {
        push("error", e instanceof ApiCallError ? e.message : "Something went wrong.");
        await refreshCart();
        return false;
      }
    },
    [push, refreshCart],
  );

  const value = useMemo<StoreCtx>(
    () => ({
      user,
      cart,
      cartCount,
      cartLoading,
      drawerOpen,
      setDrawerOpen,
      refreshCart,
      addToCart: async (variantId, quantity, opts) => {
        try {
          await api("/api/cart/items", { body: { variantId, quantity } });
          await refreshCart();
          if (opts?.openDrawer !== false) setDrawerOpenState(true);
          return true;
        } catch (e) {
          push("error", e instanceof ApiCallError ? e.message : "Couldn't add to bag.");
          return false;
        }
      },
      updateQuantity: async (itemId, quantity) => {
        await handle(() => api(`/api/cart/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: { quantity } }));
      },
      removeItem: async (itemId) => {
        await handle(() => api(`/api/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" }));
      },
      applyCoupon: async (code) => {
        try {
          await api("/api/cart/coupon", { body: { code } });
          await refreshCart();
          return null;
        } catch (e) {
          return e instanceof ApiCallError ? e.message : "Couldn't apply the code.";
        }
      },
      removeCoupon: async () => {
        await handle(() => api("/api/cart/coupon", { method: "DELETE" }));
      },
      reconcile: async () => {
        await handle(() => api("/api/cart/reconcile", { method: "POST", body: {} }));
      },
      wishlist,
      wishlistReady,
      toggleWishlist: async (productId) => {
        const on = !wishlist.has(productId);
        const next = new Set(wishlist);
        if (on) next.add(productId);
        else next.delete(productId);
        setWishlist(next);
        if (user && !user.isStaff) {
          try {
            await api("/api/wishlist", { body: { productId, on } });
          } catch (e) {
            setWishlist(wishlist);
            push("error", (e as Error).message);
            return;
          }
        } else {
          try {
            localStorage.setItem(GUEST_WL, JSON.stringify([...next]));
          } catch {}
        }
        push("success", on ? "Saved to your wishlist" : "Removed from your wishlist");
      },
    }),
    [user, cart, cartCount, cartLoading, drawerOpen, setDrawerOpen, refreshCart, handle, push, wishlist, wishlistReady],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
}
