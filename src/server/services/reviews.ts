import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { sha256 } from "@/lib/crypto";
import { enforce } from "./rate-limit";

export const reviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional(),
  body: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(2000),
});

/** Only customers with a delivered order line may review; reviews start PENDING moderation. */
export async function submitReview(userId: string, input: z.input<typeof reviewSchema>) {
  const data = reviewSchema.parse(input);
  await enforce(`review:user:${userId}`, 10, 86400);
  const item = await db.orderItem.findUnique({ where: { id: data.orderItemId }, include: { order: true, reviews: true } });
  if (!item || item.order.userId !== userId || !item.productId) throw new AppError("NOT_ELIGIBLE", "You can review products from your delivered orders.", 403);
  if (item.order.fulfillmentStatus !== "DELIVERED") throw new AppError("NOT_ELIGIBLE", "You can review this product once it's delivered.", 403);
  if (item.reviews.length) throw new AppError("ALREADY_REVIEWED", "You've already reviewed this item.", 409);
  return db.review.create({ data: { productId: item.productId, userId, orderItemId: item.id, rating: data.rating, title: data.title, body: data.body, isVerifiedPurchase: true } });
}

export async function reportReview(reviewId: string, reporterKey: string, reason: string) {
  await enforce(`review_report:${sha256(reporterKey)}`, 20, 86400);
  const r = await db.review.findUnique({ where: { id: reviewId } });
  if (!r || r.status !== "APPROVED") throw new AppError("NOT_FOUND", "Review not found", 404);
  try {
    await db.reviewReport.create({ data: { reviewId, reporterKey: sha256(reporterKey), reason: reason.slice(0, 200) } });
    await db.review.update({ where: { id: reviewId }, data: { reportCount: { increment: 1 } } });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
}

export async function moderateReview(reviewId: string, status: "APPROVED" | "REJECTED", note?: string) {
  await db.review.update({ where: { id: reviewId }, data: { status, moderatedAt: new Date(), moderationNote: note } });
}
