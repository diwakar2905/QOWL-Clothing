"use client";

import { useEffect } from "react";
import { useStore } from "@/components/providers/store";

/** After an order is placed the bag is emptied on the server; refresh the header count to match. */
export function CartSync() {
  const { refreshCart } = useStore();
  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);
  return null;
}
