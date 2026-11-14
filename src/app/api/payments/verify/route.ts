import { z } from "zod";
import { confirmCheckoutPayment } from "@/server/services/payments";
import { enforce } from "@/server/services/rate-limit";
import { clientIp } from "@/server/request";
import { handle, json, readJson } from "@/server/api";

export const POST = handle(async (req: Request) => {
  await enforce(`payverify:ip:${await clientIp()}`, 30, 600);
  const b = z.object({ razorpay_order_id: z.string().max(64), razorpay_payment_id: z.string().max(64), razorpay_signature: z.string().max(128) }).parse(await readJson(req));
  const r = await confirmCheckoutPayment({ providerOrderId: b.razorpay_order_id, providerPaymentId: b.razorpay_payment_id, signature: b.razorpay_signature });
  return json({ status: r.status });
});
