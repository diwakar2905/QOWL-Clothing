import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { toggleWishlist, wishlistProductIds } from "@/server/services/wishlist";
import { handle, json, readJson } from "@/server/api";

export const GET = handle(async () => {
  const u = await requireUser();
  return json(await wishlistProductIds(u.id));
});

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const body = z.object({ productId: z.string().min(1).max(64), on: z.boolean().optional() }).parse(await readJson(req));
  return json({ on: await toggleWishlist(u.id, body.productId, body.on) });
});
