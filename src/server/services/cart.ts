import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError, notFound } from "@/lib/errors";
import { priceCart, unitPrice, type PricingResult } from "@/domain/pricing";
import { getCurrentUser } from "@/server/auth/session";
import { evaluateCoupon } from "./coupons";
import { getSettings } from "./settings";
import { visibleProductWhere } from "./catalog";

const PROD = process.env.NODE_ENV === "production";
export const CART_COOKIE = PROD ? "__Host-qowl_cart" : "qowl_cart";
export const MAX_LINE_QTY = 10;
export const MAX_LINES = 30;

const cartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          inventory: true,
          color: true,
          product: {
            include: {
              taxClass: true,
              images: { orderBy: { sortOrder: "asc" as const } },
            },
          },
        },
      },
    },
  },
};

async function findCart(createIfMissing: boolean) {
  const user = await getCurrentUser();
  if (user && !user.isStaff) {
    const existing = await db.cart.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } });
    if (existing || !createIfMissing) return existing;
    return db.cart.create({ data: { userId: user.id } });
  }
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (token && token.length <= 100) {
    const existing = await db.cart.findUnique({ where: { guestTokenHash: sha256(token) } });
    if (existing) return existing;
  }
  if (!createIfMissing) return null;
  const fresh = randomToken(24);
  const cart = await db.cart.create({ data: { guestTokenHash: sha256(fresh) } });
  jar.set(CART_COOKIE, fresh, { httpOnly: true, secure: PROD, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return cart;
}

export type CartIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "PRICE_CHANGED";

export type CartLineView = {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  colorName: string;
  size: string;
  sku: string;
  imageUrl: string | null;
  imageAlt: string;
  unitPrice: number;
  unitMrp: number;
  priceSeen: number;
  quantity: number;
  lineSubtotal: number;
  lineDiscount: number;
  available: number;
  issues: CartIssue[];
};

export type CartView = {
  id: string | null;
  items: CartLineView[];
  count: number;
  couponCode: string | null;
  couponError: string | null;
  pricing: PricingResult;
  freeShippingRemaining: number | null;
  blockers: string[];
  canCheckout: boolean;
};

type CartWithItems = NonNullable<Awaited<ReturnType<typeof loadCartRow>>>;
async function loadCartRow(cartId: string) {
  return db.cart.findUnique({ where: { id: cartId }, include: cartInclude });
}

export async function buildCartView(cart: CartWithItems | null, customer: { email?: string | null; userId?: string | null } = {}, shipToState?: string | null, codFee = 0): Promise<CartView> {
  const settings = await getSettings();
  const now = new Date();
  const visible = new Set(
    cart?.items.length
      ? (await db.product.findMany({ where: { id: { in: cart.items.map((i) => i.variant.productId) }, ...visibleProductWhere(now) }, select: { id: true } })).map((p) => p.id)
      : [],
  );
  const lines = (cart?.items ?? []).map((item) => {
    const v = item.variant;
    const p = v.product;
    const price = unitPrice(p, v, now);
    const available = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0));
    const issues: CartIssue[] = [];
    if (!visible.has(p.id) || !v.isActive) issues.push("UNAVAILABLE");
    else if (available === 0) issues.push("OUT_OF_STOCK");
    else if (available < item.quantity) issues.push("INSUFFICIENT_STOCK");
    if (price !== item.priceSeen) issues.push("PRICE_CHANGED");
    const img = p.images.find((i) => i.colorId === v.colorId) ?? p.images[0];
    return { item, v, p, price, available, issues, img };
  });

  const purchasable = lines.filter((l) => !l.issues.some((i) => i !== "PRICE_CHANGED"));
  const couponLines = purchasable.map((l) => ({ key: l.item.id, productId: l.p.id, lineSubtotal: l.price * l.item.quantity }));
  let couponError: string | null = null;
  let coupon = null;
  let eligible = new Set<string>();
  if (cart?.couponCode && couponLines.length) {
    const ev = await evaluateCoupon(cart.couponCode, couponLines, customer, { deferIdentityChecks: true });
    if (ev.ok) {
      coupon = ev.coupon;
      eligible = ev.eligibleKeys;
    } else couponError = ev.message;
  }
  const pricing = priceCart({
    lines: purchasable.map((l) => ({ key: l.item.id, unitPrice: l.price, quantity: l.item.quantity, taxClass: l.p.taxClass, couponEligible: eligible.has(l.item.id) })),
    coupon: coupon ? { type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount } : null,
    shipping: settings.shipping,
    codFee,
    shippingTaxMode: settings.tax.shippingTaxMode,
    sellerState: settings.store.sellerState || null,
    shipToState: shipToState ?? null,
  });
  const discountByKey = new Map(pricing.lines.map((l) => [l.key, l.lineDiscount]));
  const items: CartLineView[] = lines.map((l) => ({
    id: l.item.id,
    variantId: l.v.id,
    productId: l.p.id,
    productName: l.p.name,
    productSlug: l.p.slug,
    colorName: l.v.color.name,
    size: l.v.size,
    sku: l.v.sku,
    imageUrl: l.img?.url ?? null,
    imageAlt: l.img?.alt ?? l.p.name,
    unitPrice: l.price,
    unitMrp: l.p.mrp,
    priceSeen: l.item.priceSeen,
    quantity: l.item.quantity,
    lineSubtotal: l.price * l.item.quantity,
    lineDiscount: discountByKey.get(l.item.id) ?? 0,
    available: l.available,
    issues: l.issues,
  }));

  const blockers: string[] = [];
  if (!items.length) blockers.push("Your bag is empty.");
  if (lines.some((l) => l.issues.some((i) => i !== "PRICE_CHANGED"))) blockers.push("Some items are unavailable in the requested quantity. Update your bag to continue.");
  if (lines.some((l) => l.issues.includes("PRICE_CHANGED"))) blockers.push("Prices for some items have changed. Review and confirm the new prices to continue.");
  if (!pricing.shippingConfigured) blockers.push("Checkout is temporarily unavailable while shipping rates are being configured.");
  if (!settings.payments.onlineEnabled && !settings.payments.codEnabled) blockers.push("Checkout is temporarily unavailable.");

  const t = settings.shipping.freeShippingThresholdPaise;
  const merch = pricing.subtotal - pricing.discountTotal;
  return {
    id: cart?.id ?? null,
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    couponCode: cart?.couponCode ?? null,
    couponError,
    pricing,
    freeShippingRemaining: t != null && pricing.shippingConfigured && merch < t ? t - merch : null,
    blockers,
    canCheckout: blockers.length === 0,
  };
}

export async function getCartView(): Promise<CartView> {
  const cart = await findCart(false);
  const user = await getCurrentUser();
  const row = cart ? await loadCartRow(cart.id) : null;
  return buildCartView(row, { email: user?.email, userId: user?.isStaff ? null : user?.id });
}

export async function getCartCount(): Promise<number> {
  const cart = await findCart(false);
  if (!cart) return 0;
  const agg = await db.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

export const addItemSchema = z.object({ variantId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(MAX_LINE_QTY) });

export async function addItem(input: z.input<typeof addItemSchema>) {
  const { variantId, quantity } = addItemSchema.parse(input);
  const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { inventory: true, product: true } });
  if (!variant || !variant.isActive) throw notFound("Product option");
  const visible = await db.product.count({ where: { id: variant.productId, ...visibleProductWhere() } });
  if (!visible) throw new AppError("UNAVAILABLE", "This product is not available.", 409);
  const cart = await findCart(true);
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart!.id, variantId } } });
  const desired = (existing?.quantity ?? 0) + quantity;
  if (desired > MAX_LINE_QTY) throw new AppError("QTY_LIMIT", `You can add up to ${MAX_LINE_QTY} of each item.`, 409);
  const available = Math.max(0, (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0));
  if (available === 0) throw new AppError("OUT_OF_STOCK", "This size is out of stock.", 409);
  if (desired > available) throw new AppError("INSUFFICIENT_STOCK", `Only ${available} available in this size.`, 409, { available });
  if (!existing && (await db.cartItem.count({ where: { cartId: cart!.id } })) >= MAX_LINES) throw new AppError("CART_FULL", "Your bag is full.", 409);
  const price = unitPrice(variant.product, variant);
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart!.id, variantId } },
    create: { cartId: cart!.id, variantId, quantity: desired, priceSeen: price },
    update: { quantity: desired, priceSeen: price },
  });
  await db.cart.update({ where: { id: cart!.id }, data: { updatedAt: new Date() } });
}

async function ownedItem(itemId: string) {
  const cart = await findCart(false);
  if (!cart) throw notFound("Bag item");
  // Scope by cart id to prevent IDOR on other customers' carts.
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId: cart.id }, include: { variant: { include: { inventory: true } } } });
  if (!item) throw notFound("Bag item");
  return item;
}

export async function updateQuantity(itemId: string, quantity: number) {
  const q = z.number().int().min(0).max(MAX_LINE_QTY).parse(quantity);
  const item = await ownedItem(itemId);
  if (q === 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return;
  }
  const available = Math.max(0, (item.variant.inventory?.onHand ?? 0) - (item.variant.inventory?.reserved ?? 0));
  if (q > item.quantity && q > available) throw new AppError("INSUFFICIENT_STOCK", available ? `Only ${available} available in this size.` : "This size is out of stock.", 409, { available });
  await db.cartItem.update({ where: { id: item.id }, data: { quantity: q } });
}

export async function removeItem(itemId: string) {
  const item = await ownedItem(itemId);
  await db.cartItem.delete({ where: { id: item.id } });
}

/** Customer acknowledges price changes / fixes stock issues in one step. */
export async function reconcileCart() {
  const cart = await findCart(false);
  if (!cart) return;
  const row = await loadCartRow(cart.id);
  const now = new Date();
  for (const item of row?.items ?? []) {
    const v = item.variant;
    const available = Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0));
    const visible = await db.product.count({ where: { id: v.productId, ...visibleProductWhere(now) } });
    if (!visible || !v.isActive || available === 0) await db.cartItem.delete({ where: { id: item.id } });
    else await db.cartItem.update({ where: { id: item.id }, data: { quantity: Math.min(item.quantity, available), priceSeen: unitPrice(v.product, v, now) } });
  }
}

export async function applyCoupon(code: string) {
  const cart = await findCart(false);
  if (!cart) throw new AppError("CART_EMPTY", "Add something to your bag first.");
  const user = await getCurrentUser();
  const row = await loadCartRow(cart.id);
  const view = await buildCartView(row ? { ...row, couponCode: code } : null, { email: user?.email, userId: user?.id });
  if (view.couponError) throw new AppError("COUPON_REJECTED", view.couponError, 409);
  if (view.pricing.discountTotal <= 0) throw new AppError("COUPON_NOT_APPLICABLE", "This code doesn't apply to the items in your bag.", 409);
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: code.trim().toUpperCase() } });
}

export async function removeCoupon() {
  const cart = await findCart(false);
  if (cart) await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
}

/** Merge the anonymous bag into the customer's bag after sign-in. */
export async function mergeGuestCartOnLogin(userId: string) {
  const jar = await cookies();
  const token = jar.get(CART_COOKIE)?.value;
  if (!token) return;
  const guest = await db.cart.findUnique({ where: { guestTokenHash: sha256(token) }, include: { items: true } });
  jar.delete(CART_COOKIE);
  if (!guest) return;
  await db.$transaction(async (tx) => {
    let target = await tx.cart.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    target ??= await tx.cart.create({ data: { userId } });
    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } } });
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: target.id, variantId: item.variantId } },
        create: { cartId: target.id, variantId: item.variantId, quantity: item.quantity, priceSeen: item.priceSeen },
        update: { quantity: Math.min(MAX_LINE_QTY, (existing?.quantity ?? 0) + item.quantity) },
      });
    }
    if (guest.couponCode && !target.couponCode) await tx.cart.update({ where: { id: target.id }, data: { couponCode: guest.couponCode } });
    await tx.cart.delete({ where: { id: guest.id } });
  });
}

export async function currentCartRow() {
  const cart = await findCart(false);
  return cart ? loadCartRow(cart.id) : null;
}
