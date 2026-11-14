import { db } from "@/lib/db";
import { testCookies } from "./integration-setup";
import { createSession } from "@/server/auth/session";

export function resetCookies() {
  testCookies.clear();
}

/** A fresh browser session signed in as a new, verified customer (checkout requires sign-in). */
export async function asShopper() {
  testCookies.clear();
  const tag = Math.random().toString(36).slice(2, 10);
  const user = await db.user.create({ data: { email: `shopper-${tag}@example.com`, name: "Test Shopper", emailVerifiedAt: new Date() } });
  await createSession(user.id, { isStaff: false });
  return user;
}

/** A fresh variant with exact stock, isolated from fixture data. */
export async function makeVariant(onHand: number, opts: { price?: number } = {}) {
  const base = await db.product.findUniqueOrThrow({ where: { slug: "origin" } });
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const product = await db.product.create({
    data: {
      name: `Test ${suffix}`, slug: `test-${suffix.toLowerCase()}`, styleCode: `TST-${suffix}`, description: "Integration test product", categoryId: base.categoryId,
      garmentType: "Oversized T-shirt", price: opts.price ?? 100000, mrp: opts.price ?? 100000, taxClassId: base.taxClassId, status: "ACTIVE", searchText: `test ${suffix}`,
    },
  });
  const color = await db.productColor.create({ data: { productId: product.id, name: "Black", slug: "black", hex: "#000000" } });
  const variant = await db.productVariant.create({ data: { productId: product.id, colorId: color.id, size: "M", sku: `TST-${suffix}-M` } });
  await db.inventoryLevel.create({ data: { variantId: variant.id, onHand } });
  await db.productImage.create({ data: { productId: product.id, url: "/concept/origin-front.webp", alt: "test", sortOrder: 0 } });
  return { product, variant };
}

export async function level(variantId: string) {
  return db.inventoryLevel.findUniqueOrThrow({ where: { variantId } });
}

export const address = { fullName: "Test Buyer", phone: "9876543210", line1: "1 Test Lane", city: "Mumbai", state: "Maharashtra" as const, pincode: "400001", country: "IN" as const };
