import { getCartView } from "@/server/services/cart";
import { handle, json } from "@/server/api";

export const GET = handle(async () => json(await getCartView()));
