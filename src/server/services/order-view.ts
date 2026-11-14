import "server-only";
import { canRequestReturn } from "@/domain/returns";
import { getSetting } from "./settings";

/** Customer-facing permissions for an order (used by the order pages). */
export async function orderCapabilities(order: { status: string; fulfillmentStatus: string; deliveredAt: Date | null; paymentStatus: string }, signedInOwner: boolean) {
  const policy = await getSetting("returns");
  const ret = canRequestReturn(policy, order, "RETURN");
  const exch = canRequestReturn(policy, order, "EXCHANGE");
  return {
    // Return/exchange requests require an account so status can be tracked securely.
    returnEligible: signedInOwner && (ret.ok || exch.ok),
    canCancel: ["CONFIRMED", "PROCESSING"].includes(order.status) && order.fulfillmentStatus === "UNFULFILLED",
  };
}
