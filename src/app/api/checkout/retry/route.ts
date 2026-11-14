import { z } from "zod";
import { retryPayment } from "@/server/services/checkout";
import { getCurrentUser } from "@/server/auth/session";
import { handle, json, readJson } from "@/server/api";

export const POST = handle(async (req: Request) => {
  const body = z.object({ orderNumber: z.string().max(30), token: z.string().max(100).optional() }).parse(await readJson(req));
  const user = await getCurrentUser();
  return json(await retryPayment(body.orderNumber, body.token ?? null, user?.id ?? null));
});
