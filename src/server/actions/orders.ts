"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { emailSchema } from "@/lib/validation";
import { runAction } from "@/server/api";
import { getCurrentUser } from "@/server/auth/session";
import { getOrderForAccess, requestCancellation } from "@/server/services/orders";
import { requestReturn } from "@/server/services/returns";
import { enforce } from "@/server/services/rate-limit";
import { clientIp } from "@/server/request";
import { customerStatusLabel } from "@/domain/state-machines";

async function accessible(number: string, token: string | null) {
  const user = await getCurrentUser();
  const order = await getOrderForAccess(number, { userId: user?.id, token });
  if (!order) throw new AppError("NOT_FOUND", "Order not found", 404);
  return { order, user };
}

export async function requestCancelAction(number: string, token: string | null, reason: string) {
  return runAction(async () => {
    const { order, user } = await accessible(number, token);
    await requestCancellation(order.id, { type: "CUSTOMER", id: user?.id }, z.string().trim().min(3, "Tell us why you'd like to cancel").max(300).parse(reason));
    revalidatePath(`/orders/${number}`);
    revalidatePath(`/account/orders/${number}`);
  }, "Cancellation requested. We'll confirm by email.");
}

export async function requestReturnAction(number: string, token: string | null, input: unknown) {
  return runAction(async () => {
    const { order, user } = await accessible(number, token);
    const rr = await requestReturn(order.id, input as Parameters<typeof requestReturn>[1], { type: "CUSTOMER", id: user?.id, userId: user?.id });
    revalidatePath(`/account/orders/${number}`);
    return { number: rr.number };
  }, "Request submitted.");
}

/** Public order status lookup by order number + email (rate limited, no address/PII returned). */
export async function trackOrderAction(_prev: unknown, form: FormData) {
  return runAction(async () => {
    await enforce(`track:ip:${await clientIp()}`, 15, 900, "Too many lookups. Please wait a few minutes.");
    const number = z.string().trim().toUpperCase().regex(/^QWL-\d{6,}$/, "Enter your order number, e.g. QWL-000123").parse(form.get("number"));
    const email = emailSchema.parse(form.get("email"));
    const order = await db.order.findUnique({ where: { number }, include: { shipments: { where: { cancelledAt: null }, include: { events: { orderBy: { occurredAt: "desc" }, take: 10 } } } } });
    // Constant response for mismatches to avoid confirming order numbers.
    if (!order || sha256(order.email) !== sha256(email)) throw new AppError("NOT_FOUND", "We couldn't find an order with those details.", 404);
    return {
      number: order.number,
      status: customerStatusLabel(order),
      placedAt: order.placedAt.toISOString(),
      shipments: order.shipments.map((s) => ({ courier: s.courierName, awb: s.awb, trackingUrl: s.trackingUrl, events: s.events.map((e) => ({ status: e.status, description: e.description, location: e.location, at: e.occurredAt.toISOString() })) })),
    };
  });
}
