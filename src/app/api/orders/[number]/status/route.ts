import { getCurrentUser } from "@/server/auth/session";
import { getOrderForAccess } from "@/server/services/orders";
import { reconcileOrderPayments } from "@/server/services/payments";
import { notFound } from "@/lib/errors";
import { handle, json } from "@/server/api";

/** Lightweight status for the confirmation page; reconciles with the gateway if still pending. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ number: string }> }) => {
  const { number } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const user = await getCurrentUser();
  let order = await getOrderForAccess(number, { userId: user?.id, token });
  if (!order) throw notFound("Order");
  if (order.status === "PENDING_PAYMENT" && order.paymentMethod === "ONLINE") {
    await reconcileOrderPayments(order.id).catch(() => null);
    order = (await getOrderForAccess(number, { userId: user?.id, token }))!;
  }
  return json({ status: order.status, paymentStatus: order.paymentStatus });
});
