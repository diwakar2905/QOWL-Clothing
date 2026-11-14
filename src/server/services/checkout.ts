import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { addressSchema, emailSchema, indianMobileSchema } from "@/lib/validation";
import { formatINR } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/server/auth/session";
import { getGateway } from "@/server/payments";
import { checkDelivery } from "@/server/shipping";
import { enqueueEmail } from "@/server/notifications/outbox";
import { buildCartView, currentCartRow } from "./cart";
import { evaluateCoupon } from "./coupons";
import { getSettings } from "./settings";
import { commitOrderStock, reserve } from "./inventory";
import { nextNumber, orderLink, recordHistory } from "./orders";
import { ensureGatewayOrder } from "./payments";
import { enforce } from "./rate-limit";

export const checkoutSchema = z.object({
  idempotencyKey: z.string().uuid(),
  email: emailSchema,
  phone: indianMobileSchema,
  address: addressSchema,
  paymentMethod: z.enum(["ONLINE", "COD"]),
  acceptTerms: z.literal(true, { message: "Please accept the terms to place your order" }),
  marketingOptIn: z.boolean().default(false),
  saveAddress: z.boolean().default(false),
  customerNote: z.string().trim().max(300).optional(),
  // Totals the customer saw; if the server total differs we stop and explain.
  expectedTotal: z.number().int().nonnegative(),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

export type CheckoutResult = {
  orderNumber: string;
  accessToken: string;
  paymentMethod: "ONLINE" | "COD";
  amount: number;
  payment: null | { provider: "razorpay" | "mock"; keyId?: string; providerOrderId: string; amount: number; currency: "INR"; prefill: { name: string; email: string; contact: string } };
};

/** Server-side COD eligibility. Returns a reason when not allowed. */
export async function codEligibility(args: { pincode: string; phone: string; amount: number }): Promise<{ ok: true; fee: number } | { ok: false; reason: string }> {
  const s = (await getSettings()).payments;
  if (!s.codEnabled) return { ok: false, reason: "Cash on Delivery is not available." };
  if (s.codMinOrderPaise != null && args.amount < s.codMinOrderPaise) return { ok: false, reason: `Cash on Delivery is available on orders of ${formatINR(s.codMinOrderPaise)} or more.` };
  if (s.codMaxOrderPaise != null && args.amount > s.codMaxOrderPaise) return { ok: false, reason: `Cash on Delivery is available on orders up to ${formatINR(s.codMaxOrderPaise)}.` };
  const delivery = await checkDelivery(args.pincode, { cod: true });
  if (!delivery.codAvailable) return { ok: false, reason: "Cash on Delivery isn't available for this PIN code." };
  // Fraud control: cap concurrent unfulfilled COD orders per phone number.
  const open = await db.order.count({ where: { phone: args.phone, paymentMethod: "COD", paymentStatus: "COD_PENDING", fulfillmentStatus: { in: ["UNFULFILLED", "PACKED", "READY_TO_SHIP", "SHIPPED", "OUT_FOR_DELIVERY"] } } });
  if (open >= s.codMaxOpenOrdersPerPhone) return { ok: false, reason: "You have other Cash on Delivery orders in progress. Please pay online for this order." };
  return { ok: true, fee: s.codFeePaise };
}

async function existingResult(orderId: string, accessToken: string | null): Promise<CheckoutResult> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") {
    return { orderNumber: order.number, accessToken: accessToken ?? "", paymentMethod: order.paymentMethod, amount: order.grandTotal, payment: null };
  }
  const payment = await ensureGatewayOrder(order.id);
  const g = getGateway().publicConfig();
  return {
    orderNumber: order.number,
    accessToken: accessToken ?? "",
    paymentMethod: order.paymentMethod,
    amount: order.grandTotal,
    payment: { provider: g.provider, keyId: g.keyId, providerOrderId: payment.providerOrderId!, amount: order.grandTotal, currency: "INR", prefill: { name: order.customerName, email: order.email, contact: order.phone } },
  };
}

export async function placeOrder(input: CheckoutInput, ctx: { ip: string }): Promise<CheckoutResult> {
  await enforce(`checkout:ip:${ctx.ip}`, 20, 600, "Too many checkout attempts. Please wait a few minutes.");
  const data = checkoutSchema.parse(input);
  const user = await getCurrentUser();
  const customerUserId = user && !user.isStaff ? user.id : null;

  // Refresh/double-submit safety: the same idempotency key returns the same order.
  const dup = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (dup) {
    if (dup.email !== data.email) throw new AppError("IDEMPOTENCY_CONFLICT", "This checkout session was already used. Please reload the page.", 409);
    // Access token isn't stored in plain text; a fresh one is issued for the same order.
    const token = randomToken(24);
    await db.order.update({ where: { id: dup.id }, data: { accessTokenHash: sha256(token) } });
    return existingResult(dup.id, token);
  }

  const settings = await getSettings();
  if (data.paymentMethod === "ONLINE" && !settings.payments.onlineEnabled) throw new AppError("PAYMENT_UNAVAILABLE", "Online payment is currently unavailable.", 409);

  const delivery = await checkDelivery(data.address.pincode);
  if (!delivery.serviceable) throw new AppError("NOT_SERVICEABLE", delivery.message, 409);

  const cartRow = await currentCartRow();
  if (!cartRow || !cartRow.items.length) throw new AppError("CART_EMPTY", "Your bag is empty.", 409);

  let codFee = 0;
  const preview = await buildCartView(cartRow, { email: data.email, userId: customerUserId }, data.address.state);
  if (data.paymentMethod === "COD") {
    const cod = await codEligibility({ pincode: data.address.pincode, phone: data.phone, amount: preview.pricing.grandTotal });
    if (!cod.ok) throw new AppError("COD_UNAVAILABLE", cod.reason, 409);
    codFee = cod.fee;
  }
  const view = codFee ? await buildCartView(cartRow, { email: data.email, userId: customerUserId }, data.address.state, codFee) : preview;
  if (!view.canCheckout) throw new AppError("CART_NOT_READY", view.blockers[0] ?? "Your bag needs attention.", 409, { blockers: view.blockers });
  if (view.couponCode && view.couponError) throw new AppError("COUPON_REJECTED", `${view.couponError} Remove the code to continue.`, 409);
  if (view.pricing.grandTotal !== data.expectedTotal) {
    throw new AppError("TOTAL_CHANGED", `Your order total has changed to ${formatINR(view.pricing.grandTotal)}. Please review before paying.`, 409, { total: view.pricing.grandTotal });
  }

  const accessToken = randomToken(24);
  const settingsTtl = Number(process.env.RESERVATION_TTL_MINUTES ?? 30);
  const lineByItem = new Map(view.items.map((i) => [i.id, i]));
  const taxByKey = new Map(view.pricing.lines.map((l) => [l.key, l]));
  const hsnByVariant = new Map(cartRow.items.map((i) => [i.variantId, i.variant.product.taxClass.hsnCode]));

  let orderId: string;
  try {
    orderId = await db.$transaction(
      async (tx: Tx) => {
        const number = await nextNumber(tx, "order", "QWL-");
        const isCod = data.paymentMethod === "COD";
        const order = await tx.order.create({
          data: {
            number,
            userId: customerUserId,
            email: data.email,
            phone: data.phone,
            customerName: data.address.fullName,
            shippingAddress: { ...data.address, phone: data.phone } as Prisma.InputJsonValue,
            status: isCod ? "CONFIRMED" : "PENDING_PAYMENT",
            paymentStatus: isCod ? "COD_PENDING" : "PENDING",
            paymentMethod: data.paymentMethod,
            subtotal: view.pricing.subtotal,
            discountTotal: view.pricing.discountTotal,
            shippingTotal: view.pricing.shippingTotal,
            codFee: view.pricing.codFee,
            taxTotal: view.pricing.taxTotal,
            grandTotal: view.pricing.grandTotal,
            couponCode: view.pricing.discountTotal > 0 ? view.couponCode : null,
            taxBreakdown: { ...view.pricing.tax, sellerState: settings.store.sellerState || null, shipToState: data.address.state, gstin: settings.store.gstin || null } as Prisma.InputJsonValue,
            idempotencyKey: data.idempotencyKey,
            cartId: cartRow.id,
            accessTokenHash: sha256(accessToken),
            termsAcceptedAt: new Date(),
            marketingOptIn: data.marketingOptIn,
            customerNote: data.customerNote,
            confirmedAt: isCod ? new Date() : null,
            items: {
              create: view.pricing.lines.map((pl) => {
                const it = lineByItem.get(pl.key)!;
                const tl = taxByKey.get(pl.key)!;
                return {
                  productId: it.productId,
                  variantId: it.variantId,
                  productName: it.productName,
                  productSlug: it.productSlug,
                  colorName: it.colorName,
                  size: it.size,
                  sku: it.sku,
                  hsnCode: hsnByVariant.get(it.variantId) ?? "",
                  imageUrl: it.imageUrl,
                  unitPrice: it.unitPrice,
                  unitMrp: it.unitMrp,
                  quantity: it.quantity,
                  lineSubtotal: tl.lineSubtotal,
                  lineDiscount: tl.lineDiscount,
                  taxRateBps: tl.taxRateBps,
                  taxAmount: tl.taxAmount,
                  lineTotal: tl.lineTotal,
                };
              }),
            },
          },
        });
        await recordHistory(tx, order.id, "ORDER", null, order.status, { type: "CUSTOMER", id: customerUserId }, isCod ? "Cash on Delivery order placed" : "Order created, awaiting payment");

        // Re-validate the coupon under a row lock so usage limits hold under concurrency.
        if (order.couponCode) {
          const ev = await evaluateCoupon(
            order.couponCode,
            view.items.map((i) => ({ key: i.id, productId: i.productId, lineSubtotal: i.lineSubtotal })),
            { email: data.email, userId: customerUserId },
            { tx, lockForUpdate: true, excludeOrderId: order.id },
          );
          if (!ev.ok) throw new AppError("COUPON_REJECTED", `${ev.message} Remove the code to continue.`, 409);
          await tx.couponRedemption.create({ data: { couponId: ev.coupon.id, orderId: order.id, userId: customerUserId, email: data.email, amount: view.pricing.discountTotal, status: isCod ? "COMMITTED" : "RESERVED" } });
          await tx.order.update({ where: { id: order.id }, data: { couponId: ev.coupon.id } });
        }

        const lines = view.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
        if (isCod) {
          const r = await commitOrderStock(tx, order.id, lines);
          if (!r.ok) throw new AppError("OUT_OF_STOCK", "Some items in your bag are no longer available in the quantity requested.", 409, { shortages: r.shortages });
          await tx.cartItem.deleteMany({ where: { cartId: cartRow.id } });
          await tx.cart.update({ where: { id: cartRow.id }, data: { couponCode: null } });
          await enqueueEmail(
            {
              template: "cod_order_placed",
              to: data.email,
              vars: { name: data.address.fullName, orderNumber: number, itemsSummary: view.items.map((i) => `• ${i.productName} — ${i.colorName} / ${i.size} × ${i.quantity}`).join("\n"), total: formatINR(order.grandTotal), link: orderLink(number, accessToken) },
              dedupeKey: `cod_placed:${order.id}`,
            },
            tx,
          );
        } else {
          await reserve(tx, order.id, lines, settingsTtl);
        }

        if (data.saveAddress && customerUserId) {
          const count = await tx.address.count({ where: { userId: customerUserId } });
          const same = await tx.address.findFirst({ where: { userId: customerUserId, line1: data.address.line1, pincode: data.address.pincode } });
          if (!same && count < 10) {
            await tx.address.create({ data: { userId: customerUserId, ...data.address, phone: data.phone, isDefault: count === 0 } });
          }
        }
        if (data.marketingOptIn && customerUserId) {
          await tx.user.update({ where: { id: customerUserId }, data: { marketingOptIn: true, marketingConsentAt: new Date() } });
        }
        return order.id;
      },
      { timeout: 20000, maxWait: 10000 },
    );
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      // Concurrent duplicate submit with the same idempotency key.
      const again = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (again) return existingResult(again.id, null);
    }
    throw e;
  }

  if (data.paymentMethod === "COD") {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    return { orderNumber: order.number, accessToken, paymentMethod: "COD", amount: order.grandTotal, payment: null };
  }

  try {
    return await existingResult(orderId, accessToken);
  } catch (e) {
    logger.error("checkout.gateway_order_failed", { orderId, e });
    // Keep the reservation until expiry so the customer can retry immediately.
    throw new AppError("GATEWAY_UNAVAILABLE", "We couldn't reach the payment provider. Your items are held for a few minutes — please try again.", 503);
  }
}

/** Retry payment for an order still awaiting payment (same reservation). */
export async function retryPayment(orderNumber: string, accessToken: string | null, userId: string | null): Promise<CheckoutResult> {
  const order = await db.order.findUnique({ where: { number: orderNumber } });
  const allowed = order && ((userId && order.userId === userId) || (accessToken && order.accessTokenHash === sha256(accessToken)));
  if (!order || !allowed) throw new AppError("NOT_FOUND", "Order not found", 404);
  if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") throw new AppError("NOT_PAYABLE", "This order is no longer awaiting payment.", 409);
  const active = await db.inventoryReservation.count({ where: { orderId: order.id, status: "ACTIVE", expiresAt: { gt: new Date() } } });
  if (!active) throw new AppError("EXPIRED", "The hold on your items has expired. Please check out again from your bag.", 409);
  if (order.status === "PAYMENT_FAILED") {
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "PENDING_PAYMENT", paymentStatus: "PENDING" } });
      await recordHistory(tx, order.id, "ORDER", "PAYMENT_FAILED", "PENDING_PAYMENT", { type: "CUSTOMER", id: userId }, "Payment retried");
    });
  }
  return existingResult(order.id, accessToken);
}
