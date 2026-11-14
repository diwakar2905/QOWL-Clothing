import { z } from "zod";
import { getProductCards } from "@/server/services/catalog";
import { handle, json } from "@/server/api";

/** Public product cards by id (used for guest wishlist and recently viewed). */
export const GET = handle(async (req: Request) => {
  const ids = z.array(z.string().max(64)).max(30).parse((new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean));
  return json(await getProductCards(ids));
});
