"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { addressSchema } from "@/lib/validation";
import { runAction } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import * as auth from "@/server/services/auth";
import { submitReview } from "@/server/services/reviews";
import { cancelReturnByCustomer } from "@/server/services/returns";
import { storeImage } from "@/server/storage";
import { enforce } from "@/server/services/rate-limit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function updateProfileAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    await auth.updateProfile(u.id, { name: str(form, "name"), phone: str(form, "phone"), marketingOptIn: form.get("marketingOptIn") === "on" });
    revalidatePath("/account", "layout");
  }, "Profile updated.");
}

export async function updatePreferencesAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    const optIn = form.get("marketingOptIn") === "on";
    await db.user.update({ where: { id: u.id }, data: { marketingOptIn: optIn, marketingConsentAt: new Date() } });
    if (!optIn) await db.newsletterSubscriber.updateMany({ where: { email: u.email, status: { not: "UNSUBSCRIBED" } }, data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() } });
    revalidatePath("/account/preferences");
  }, "Preferences saved.");
}

export async function changePasswordAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    if (str(form, "next") !== str(form, "confirm")) throw new AppError("VALIDATION", "New passwords don't match.");
    await auth.changePassword(u.id, str(form, "current"), str(form, "next"));
  }, "Password changed. Other devices have been signed out.");
}

export async function requestDeletionAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    if (str(form, "confirm") !== "DELETE") throw new AppError("VALIDATION", "Type DELETE to confirm.");
    await auth.requestAccountDeletion(u.id);
    revalidatePath("/account", "layout");
  }, "Deletion requested. We'll confirm by email once processed.");
}

export async function saveAddressAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    const id = str(form, "id");
    const data = addressSchema.parse({
      fullName: str(form, "fullName"), phone: str(form, "phone"), line1: str(form, "line1"), line2: str(form, "line2"), landmark: str(form, "landmark"),
      city: str(form, "city"), state: str(form, "state"), pincode: str(form, "pincode"), country: "IN",
    });
    const makeDefault = form.get("isDefault") === "on";
    await db.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: u.id }, data: { isDefault: false } });
      if (id) {
        const existing = await tx.address.findFirst({ where: { id, userId: u.id } });
        if (!existing) throw notFound("Address");
        await tx.address.update({ where: { id }, data: { ...data, isDefault: makeDefault || existing.isDefault } });
      } else {
        if ((await tx.address.count({ where: { userId: u.id } })) >= 10) throw new AppError("LIMIT", "You can save up to 10 addresses.");
        const first = (await tx.address.count({ where: { userId: u.id } })) === 0;
        await tx.address.create({ data: { ...data, userId: u.id, isDefault: makeDefault || first } });
      }
    });
    revalidatePath("/account/addresses");
  }, "Address saved.");
}

export async function deleteAddressAction(id: string) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await db.address.deleteMany({ where: { id, userId: u.id } });
    if (!r.count) throw notFound("Address");
    revalidatePath("/account/addresses");
  });
}

export async function submitReviewAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    await submitReview(u.id, { orderItemId: str(form, "orderItemId"), rating: Number(form.get("rating")), title: str(form, "title") || undefined, body: str(form, "body") });
    revalidatePath("/account/orders");
  }, "Thanks! Your review will appear once approved.");
}

export async function uploadReturnPhotoAction(form: FormData) {
  return runAction(async () => {
    const u = await requireUser();
    await enforce(`return_photo:${u.id}`, 20, 3600);
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("NO_FILE", "Choose a photo.");
    const img = await storeImage(file, { folder: "returns", uploadedBy: u.id, maxWidth: 1600 });
    return { url: img.url };
  });
}

export async function cancelReturnAction(id: string) {
  return runAction(async () => {
    const u = await requireUser();
    await cancelReturnByCustomer(id, u.id);
    revalidatePath("/account/orders");
  });
}

export async function signOutEverywhereAction() {
  const u = await requireUser();
  await db.session.deleteMany({ where: { userId: u.id } });
  redirect("/login");
}
