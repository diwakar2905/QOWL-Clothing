import "server-only";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getProductCards, visibleProductWhere } from "./catalog";

export async function listWishlist(userId: string) {
  const wl = await db.wishlist.findUnique({ where: { userId }, include: { items: { orderBy: { createdAt: "desc" } } } });
  return getProductCards(wl?.items.map((i) => i.productId) ?? []);
}

export async function wishlistProductIds(userId: string): Promise<string[]> {
  const wl = await db.wishlist.findUnique({ where: { userId }, include: { items: { select: { productId: true } } } });
  return wl?.items.map((i) => i.productId) ?? [];
}

export async function toggleWishlist(userId: string, productId: string, on?: boolean): Promise<boolean> {
  const exists = await db.product.count({ where: { id: productId, ...visibleProductWhere() } });
  if (!exists) throw notFound("Product");
  const wl = await db.wishlist.upsert({ where: { userId }, create: { userId }, update: {} });
  const item = await db.wishlistItem.findUnique({ where: { wishlistId_productId: { wishlistId: wl.id, productId } } });
  const target = on ?? !item;
  if (target && !item) {
    const count = await db.wishlistItem.count({ where: { wishlistId: wl.id } });
    if (count >= 200) return false;
    await db.wishlistItem.create({ data: { wishlistId: wl.id, productId } });
  } else if (!target && item) await db.wishlistItem.delete({ where: { id: item.id } });
  return target;
}

/** Merge a guest (localStorage) wishlist after sign-in. */
export async function mergeWishlist(userId: string, productIds: string[]) {
  for (const id of productIds.slice(0, 50)) await toggleWishlist(userId, id, true).catch(() => {});
}
