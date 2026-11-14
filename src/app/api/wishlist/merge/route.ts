import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { mergeWishlist } from "@/server/services/wishlist";
import { handle, json, readJson } from "@/server/api";

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const { productIds } = z.object({ productIds: z.array(z.string().max(64)).max(100) }).parse(await readJson(req));
  await mergeWishlist(u.id, productIds);
  return json({ merged: true });
});
