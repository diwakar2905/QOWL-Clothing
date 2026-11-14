/** Pure return/refund eligibility rules. */
export type ReturnPolicy = { allowReturns: boolean; allowExchanges: boolean; windowDays: number | null };

export function returnWindowOpen(policy: ReturnPolicy, deliveredAt: Date | null, now = new Date()): boolean {
  if (!deliveredAt || policy.windowDays == null) return false;
  return now.getTime() - deliveredAt.getTime() <= policy.windowDays * 86400_000;
}

export function canRequestReturn(
  policy: ReturnPolicy,
  order: { fulfillmentStatus: string; deliveredAt: Date | null; status: string },
  type: "RETURN" | "EXCHANGE",
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (type === "RETURN" && !policy.allowReturns) return { ok: false, reason: "Returns are not currently offered." };
  if (type === "EXCHANGE" && !policy.allowExchanges) return { ok: false, reason: "Exchanges are not currently offered." };
  if (order.status === "CANCELLED") return { ok: false, reason: "This order was cancelled." };
  if (order.fulfillmentStatus !== "DELIVERED") return { ok: false, reason: "Requests can be made once your order is delivered." };
  if (!returnWindowOpen(policy, order.deliveredAt, now)) return { ok: false, reason: "The request window for this order has closed." };
  return { ok: true };
}

/** Maximum amount still refundable on an order. */
export function refundableAmount(order: { grandTotal: number; refundedTotal: number }, pendingRefunds: number): number {
  return Math.max(0, order.grandTotal - order.refundedTotal - pendingRefunds);
}

/** Refund for returned units: line total share per unit (discounts already allocated). */
export function refundForReturnedUnits(item: { lineTotal: number; quantity: number }, units: number): number {
  if (units <= 0 || units > item.quantity) throw new Error("Invalid unit count");
  if (units === item.quantity) return item.lineTotal;
  return Math.floor((item.lineTotal * units) / item.quantity);
}
