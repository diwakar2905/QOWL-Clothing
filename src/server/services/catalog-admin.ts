import "server-only";
import { db } from "@/lib/db";

/** Activation checklist: never publish an incomplete product. */
export async function publishBlockers(productId: string): Promise<string[]> {
  const p = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { taxClass: true, images: true, variants: { where: { isActive: true } } } });
  const out: string[] = [];
  if (!p.variants.length) out.push("Add at least one active size/colour variant.");
  if (!p.images.length) out.push("Upload at least one image.");
  if (p.salePrice != null && p.salePrice >= p.price) out.push("Sale price must be below the regular price.");
  if (process.env.NODE_ENV === "production") {
    if (!p.detailsApproved) out.push("Confirm that fabric, GSM, fit, care and origin details reflect the produced garment (Specifications approved).");
    if (!p.taxClass.reviewedAt) out.push("The product's tax class has not been reviewed by a tax advisor (Settings → Tax).");
    if (!p.countryOfOrigin || !(p.manufacturerInfo || p.marketerInfo)) out.push("Enter country of origin and manufacturer/marketer details.");
  }
  return out;
}
