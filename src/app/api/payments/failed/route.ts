import { z } from "zod";
import { reportCheckoutFailure } from "@/server/services/payments";
import { handle, json, readJson } from "@/server/api";

/** Browser reports a dismissed/failed checkout; the gateway is asked for the truth. */
export const POST = handle(async (req: Request) => {
  const b = z.object({ providerOrderId: z.string().max(64) }).parse(await readJson(req));
  const r = await reportCheckoutFailure(b.providerOrderId);
  return json({ status: r?.status ?? "pending" });
});
