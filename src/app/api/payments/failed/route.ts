import { z } from "zod";
import { reportCheckoutFailure } from "@/server/services/payments";
import { enforce } from "@/server/services/rate-limit";
import { clientIp } from "@/server/request";
import { handle, json, readJson } from "@/server/api";

/** Browser reports a dismissed/failed checkout; the gateway is asked for the truth. */
export const POST = handle(async (req: Request) => {
  // Each call queries the payment gateway, so throttle it.
  await enforce(`payfailed:ip:${await clientIp()}`, 20, 600);
  const b = z.object({ providerOrderId: z.string().max(64) }).parse(await readJson(req));
  const r = await reportCheckoutFailure(b.providerOrderId);
  return json({ status: r?.status ?? "pending" });
});
