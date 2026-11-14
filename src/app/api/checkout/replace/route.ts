import { z } from "zod";
import { replaceUnpaidOrder } from "@/server/services/checkout";
import { getCurrentUser } from "@/server/auth/session";
import { enforce } from "@/server/services/rate-limit";
import { clientIp } from "@/server/request";
import { handle, json, readJson } from "@/server/api";

/** Release an unpaid online order so the shopper can check out again with changed details. */
export const POST = handle(async (req: Request) => {
  await enforce(`checkout-replace:ip:${await clientIp()}`, 20, 600);
  const body = z.object({ orderNumber: z.string().max(30), token: z.string().max(100).optional() }).parse(await readJson(req));
  const user = await getCurrentUser();
  return json(await replaceUnpaidOrder(body.orderNumber, body.token ?? null, user?.id ?? null));
});
