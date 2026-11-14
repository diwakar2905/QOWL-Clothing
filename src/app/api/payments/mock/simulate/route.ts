import { z } from "zod";
import { AppError } from "@/lib/errors";
import { getGateway, MockGateway } from "@/server/payments";
import { handle, json, readJson } from "@/server/api";

/** Development-only stand-in for the hosted checkout popup. */
export const POST = handle(async (req: Request) => {
  const g = getGateway();
  if (!(g instanceof MockGateway) || process.env.NODE_ENV === "production") throw new AppError("NOT_FOUND", "Not found", 404);
  const b = z.object({ providerOrderId: z.string().max(64), outcome: z.enum(["success", "failure"]) }).parse(await readJson(req));
  const r = await g.simulate(b.providerOrderId, b.outcome);
  return json({ razorpay_order_id: b.providerOrderId, razorpay_payment_id: r.payment.id, razorpay_signature: r.signature, status: r.payment.status, error: r.payment.errorDescription ?? null });
});
