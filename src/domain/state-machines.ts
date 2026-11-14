/**
 * Explicit, server-validated state machines. Every status change in the
 * system goes through `assertTransition`.
 */
import type { OrderStatus, FulfillmentStatus, ReturnStatus, PaymentStatus } from "@/generated/prisma/enums";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "PAYMENT_FAILED", "EXPIRED", "CANCELLED", "ON_HOLD"],
  PAYMENT_FAILED: ["PENDING_PAYMENT", "CONFIRMED", "EXPIRED", "CANCELLED", "ON_HOLD"],
  EXPIRED: ["CONFIRMED", "ON_HOLD"], // late successful payment
  CONFIRMED: ["PROCESSING", "CANCELLATION_REQUESTED", "CANCELLED", "ON_HOLD", "COMPLETED"],
  PROCESSING: ["CANCELLATION_REQUESTED", "CANCELLED", "ON_HOLD", "COMPLETED"],
  ON_HOLD: ["CONFIRMED", "PROCESSING", "CANCELLED"],
  CANCELLATION_REQUESTED: ["CANCELLED", "PROCESSING", "CONFIRMED"],
  CANCELLED: [],
  COMPLETED: [],
};

export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  UNFULFILLED: ["PACKED", "READY_TO_SHIP", "SHIPPED", "CANCELLED"],
  PACKED: ["READY_TO_SHIP", "SHIPPED", "UNFULFILLED", "CANCELLED"],
  READY_TO_SHIP: ["SHIPPED", "PACKED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED", "RTO_INITIATED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RTO_INITIATED", "SHIPPED"],
  DELIVERED: [],
  RTO_INITIATED: ["RTO_DELIVERED", "DELIVERED"],
  RTO_DELIVERED: [],
  CANCELLED: [],
};

export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PICKUP_SCHEDULED", "IN_TRANSIT", "RECEIVED", "CANCELLED"],
  PICKUP_SCHEDULED: ["IN_TRANSIT", "RECEIVED", "CANCELLED"],
  IN_TRANSIT: ["RECEIVED"],
  RECEIVED: ["INSPECTED"],
  INSPECTED: ["REFUND_PENDING", "EXCHANGE_SHIPPED", "COMPLETED", "REJECTED"],
  REFUND_PENDING: ["COMPLETED"],
  EXCHANGE_SHIPPED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["AUTHORIZED", "PAID", "FAILED", "COD_PENDING"],
  AUTHORIZED: ["PAID", "FAILED"],
  FAILED: ["PAID", "AUTHORIZED", "PENDING"],
  PAID: ["PARTIALLY_REFUNDED", "REFUNDED"],
  COD_PENDING: ["COD_COLLECTED", "FAILED"],
  COD_COLLECTED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  REFUNDED: [],
};

export class InvalidTransitionError extends Error {
  constructor(public field: string, public from: string, public to: string) {
    super(`Invalid ${field} transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): boolean {
  return map[from]?.includes(to) ?? false;
}

export function assertTransition<S extends string>(field: string, map: Record<S, S[]>, from: S, to: S) {
  if (!canTransition(map, from, to)) throw new InvalidTransitionError(field, from, to);
}

/** Customer-facing combined label. */
export function customerStatusLabel(o: { status: OrderStatus; paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus }): string {
  if (o.status === "CANCELLED") return "Cancelled";
  if (o.status === "PENDING_PAYMENT") return "Awaiting payment";
  if (o.status === "PAYMENT_FAILED") return "Payment failed";
  if (o.status === "EXPIRED") return "Payment window expired";
  if (o.status === "CANCELLATION_REQUESTED") return "Cancellation requested";
  if (o.status === "ON_HOLD") return "On hold — our team will contact you";
  const f: Record<FulfillmentStatus, string> = {
    UNFULFILLED: o.status === "PROCESSING" ? "Processing" : "Confirmed",
    PACKED: "Packed",
    READY_TO_SHIP: "Ready to ship",
    SHIPPED: "Shipped",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    RTO_INITIATED: "Returning to sender",
    RTO_DELIVERED: "Returned to sender",
    CANCELLED: "Cancelled",
  };
  return f[o.fulfillmentStatus];
}

export function humanise(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
