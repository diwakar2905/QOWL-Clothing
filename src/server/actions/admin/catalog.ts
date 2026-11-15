"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { slugify, sizeRank } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { runAction } from "@/server/api";
import { requirePermission } from "@/server/auth/session";
import { audit } from "@/server/services/audit";
import { buildSearchText } from "@/server/services/catalog";
import { publishBlockers } from "@/server/services/catalog-admin";
import { storeImage, deleteStoredImage } from "@/server/storage";
import { str, opt, bool, intOrNull, paise, istDate, list } from "./_util";
import { isRenderableImageUrl } from "@/lib/utils";
import { pingIndexNow } from "@/lib/indexnow";

const optImage = (v: string | null) => {
  if (v && !isRenderableImageUrl(v)) throw new AppError("VALIDATION", "Images must be uploaded or use a /path or media-CDN URL.");
  return v;
};

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function refreshSearchText(productId: string) {
  const p = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { category: true, colors: true, variants: true, collections: { include: { collection: true } } } });
  await db.product.update({
    where: { id: productId },
    data: { searchText: buildSearchText({ name: p.name, styleCode: p.styleCode, subtitle: p.subtitle, description: p.description, tags: p.tags, categoryName: p.category.name, colors: p.colors.map((c) => c.name), skus: p.variants.map((v) => v.sku), collections: p.collections.map((c) => c.collection.title) }) },
  });
}


function productData(form: FormData) {
  const name = z.string().min(2).max(80).parse(str(form, "name"));
  const slug = z.string().regex(slugRe, "Use lowercase letters, numbers and dashes").max(80).parse(str(form, "slug") || slugify(name));
  const price = paise(form, "price")!;
  const mrp = paise(form, "mrp", false) ?? price;
  const salePrice = paise(form, "salePrice", false);
  if (price <= 0) throw new AppError("VALIDATION", "Price must be greater than zero.");
  if (mrp < price) throw new AppError("VALIDATION", "MRP cannot be lower than the selling price.");
  if (salePrice != null && salePrice >= price) throw new AppError("VALIDATION", "Sale price must be lower than the regular price.");
  return {
    name,
    slug,
    styleCode: z.string().regex(/^[A-Z0-9-]{3,30}$/, "Use uppercase letters, digits and dashes").parse(str(form, "styleCode").toUpperCase()),
    subtitle: opt(form, "subtitle"),
    description: z.string().min(10, "Add a description").max(4000).parse(str(form, "description")),
    story: opt(form, "story"),
    categoryId: z.string().min(1, "Choose a category").parse(str(form, "categoryId")),
    garmentType: z.string().min(2).max(60).parse(str(form, "garmentType")),
    price,
    mrp,
    salePrice,
    saleStartsAt: istDate(form, "saleStartsAt"),
    saleEndsAt: istDate(form, "saleEndsAt"),
    taxClassId: z.string().min(1, "Choose a tax class").parse(str(form, "taxClassId")),
    fabric: opt(form, "fabric"),
    gsm: opt(form, "gsm"),
    fit: opt(form, "fit"),
    careInstructions: opt(form, "careInstructions"),
    countryOfOrigin: opt(form, "countryOfOrigin"),
    manufacturerInfo: opt(form, "manufacturerInfo"),
    marketerInfo: opt(form, "marketerInfo"),
    netQuantity: opt(form, "netQuantity"),
    detailsApproved: bool(form, "detailsApproved"),
    sizeGuideId: opt(form, "sizeGuideId"),
    tags: list(form, "tags").map((t) => t.toLowerCase().slice(0, 30)).slice(0, 20),
    isFeatured: bool(form, "isFeatured"),
    sortOrder: intOrNull(form, "sortOrder") ?? 0,
    seoTitle: opt(form, "seoTitle"),
    seoDescription: opt(form, "seoDescription"),
  };
}

export async function createProductAction(_p: unknown, form: FormData) {
  let id = "";
  const r = await runAction(async () => {
    const u = await requirePermission("catalog.write");
    const data = productData(form);
    const p = await db.product.create({ data: { ...data, status: "DRAFT" } });
    await refreshSearchText(p.id);
    await audit({ actorId: u.id, action: "product.create", entityType: "Product", entityId: p.id, after: data });
    id = p.id;
  });
  if (r.ok) redirect(`/admin/products/${id}?created=1`);
  return r;
}

export async function updateProductAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const id = str(form, "id");
    const before = await db.product.findUnique({ where: { id } });
    if (!before) throw notFound("Product");
    const data = productData(form);
    if (before.isFixture === false && data.detailsApproved !== before.detailsApproved) await requirePermission("catalog.publish");
    await db.product.update({ where: { id }, data });
    await refreshSearchText(id);
    await audit({ actorId: u.id, action: "product.update", entityType: "Product", entityId: id, before: { price: before.price, mrp: before.mrp, salePrice: before.salePrice, status: before.status }, after: { price: data.price, mrp: data.mrp, salePrice: data.salePrice } });
    revalidatePath(`/admin/products/${id}`);
    revalidatePath(`/products/${data.slug}`);
    if (before.status === "ACTIVE") pingIndexNow([`/products/${data.slug}`, ...(before.slug !== data.slug ? [`/products/${before.slug}`] : [])]);
  }, "Product saved.");
}

export async function setProductStatusAction(id: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED", publishAtRaw?: string) {
  return runAction(async () => {
    const u = await requirePermission("catalog.publish");
    const p = await db.product.findUnique({ where: { id } });
    if (!p) throw notFound("Product");
    if (status === "ACTIVE") {
      const blockers = await publishBlockers(id);
      if (blockers.length) throw new AppError("NOT_READY", `Can't publish yet: ${blockers.join(" ")}`, 409);
    }
    const fd = new FormData();
    if (publishAtRaw) fd.set("publishAt", publishAtRaw);
    const publishAt = status === "ACTIVE" ? istDate(fd, "publishAt") : null;
    await db.product.update({ where: { id }, data: { status, publishAt, publishedAt: status === "ACTIVE" && !p.publishedAt ? publishAt ?? new Date() : p.publishedAt } });
    await audit({ actorId: u.id, action: "product.status", entityType: "Product", entityId: id, before: { status: p.status }, after: { status, publishAt } });
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${id}`);
    // Published, unpublished or archived: either way engines should recrawl (new page, or now a 404).
    if (status !== p.status) pingIndexNow([`/products/${p.slug}`]);
  }, status === "ACTIVE" ? "Product published." : `Product set to ${status.toLowerCase()}.`);
}

export async function saveColorAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const productId = str(form, "productId");
    const id = opt(form, "id");
    const name = z.string().min(2).max(40).parse(str(form, "name"));
    const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #073D2D").parse(str(form, "hex"));
    const slug = slugify(name);
    if (id) await db.productColor.update({ where: { id, productId }, data: { name, hex, slug } });
    else await db.productColor.create({ data: { productId, name, hex, slug, sortOrder: await db.productColor.count({ where: { productId } }) } });
    await refreshSearchText(productId);
    await audit({ actorId: u.id, action: id ? "color.update" : "color.create", entityType: "Product", entityId: productId, after: { name, hex } });
    revalidatePath(`/admin/products/${productId}`);
  }, "Colour saved.");
}

export async function deleteColorAction(productId: string, colorId: string) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const variantIds = (await db.productVariant.findMany({ where: { colorId }, select: { id: true } })).map((v) => v.id);
    const sold = await db.orderItem.count({ where: { variantId: { in: variantIds } } });
    if (sold) throw new AppError("IN_USE", "This colour has orders; deactivate its variants instead.", 409);
    await db.$transaction([db.productVariant.deleteMany({ where: { colorId } }), db.productColor.delete({ where: { id: colorId, productId } })]);
    await audit({ actorId: u.id, action: "color.delete", entityType: "Product", entityId: productId, before: { colorId } });
    revalidatePath(`/admin/products/${productId}`);
  });
}

/** Create variants for a colour across sizes (SKUs auto-generated, editable after). */
export async function generateVariantsAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const productId = str(form, "productId");
    const colorId = str(form, "colorId");
    const sizes = list(form, "sizes").map((s) => s.toUpperCase().slice(0, 10));
    if (!sizes.length) throw new AppError("VALIDATION", "Enter at least one size, e.g. S, M, L, XL, XXL");
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    const color = await db.productColor.findUniqueOrThrow({ where: { id: colorId } });
    let created = 0;
    for (const size of sizes) {
      const exists = await db.productVariant.findUnique({ where: { productId_colorId_size: { productId, colorId, size } } });
      if (exists) continue;
      const code = color.slug.split("-").map((w) => w[0]!.toUpperCase()).join("") + color.slug.slice(-1).toUpperCase();
      let sku = `${product.styleCode}-${code}-${size}`;
      if (await db.productVariant.findUnique({ where: { sku } })) sku = `${sku}-${color.id.slice(-4).toUpperCase()}`;
      const v = await db.productVariant.create({ data: { productId, colorId, size, sizeRank: sizeRank(size), sku } });
      await db.inventoryLevel.create({ data: { variantId: v.id, onHand: 0 } });
      created++;
    }
    await refreshSearchText(productId);
    await audit({ actorId: u.id, action: "variants.generate", entityType: "Product", entityId: productId, after: { colorId, sizes, created } });
    revalidatePath(`/admin/products/${productId}`);
    return { created };
  }, "Variants created with zero stock. Add stock from Inventory.");
}

export async function updateVariantAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const id = str(form, "id");
    const sku = z.string().regex(/^[A-Z0-9-]{3,40}$/, "SKU: uppercase letters, digits, dashes").parse(str(form, "sku").toUpperCase());
    const priceOverride = paise(form, "priceOverride", false);
    const v = await db.productVariant.update({ where: { id }, data: { sku, priceOverride, isActive: bool(form, "isActive") } });
    await refreshSearchText(v.productId);
    await audit({ actorId: u.id, action: "variant.update", entityType: "ProductVariant", entityId: id, after: { sku, priceOverride, isActive: v.isActive } });
    revalidatePath(`/admin/products/${v.productId}`);
  }, "Variant saved.");
}

export async function uploadProductImagesAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const productId = str(form, "productId");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new AppError("NO_FILE", "Choose one or more images.");
    if (files.length > 12) throw new AppError("TOO_MANY", "Upload up to 12 images at a time.");
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    let order = await db.productImage.count({ where: { productId } });
    for (const file of files) {
      const img = await storeImage(file, { folder: "products", uploadedBy: u.id });
      await db.productImage.create({
        data: { productId, colorId: opt(form, "colorId"), url: img.url, storageKey: img.storageKey, width: img.width, height: img.height, alt: str(form, "alt") || `${product.name} — product photo`, kind: (str(form, "kind") || "OTHER") as Prisma.ProductImageCreateInput["kind"], isConcept: bool(form, "isConcept"), sortOrder: order++ },
      });
    }
    await audit({ actorId: u.id, action: "images.upload", entityType: "Product", entityId: productId, after: { count: files.length } });
    revalidatePath(`/admin/products/${productId}`);
  }, "Images uploaded.");
}

export async function updateImageAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    await requirePermission("catalog.write");
    const id = str(form, "id");
    const img = await db.productImage.update({
      where: { id },
      data: { alt: z.string().min(3, "Describe the image for screen readers").max(200).parse(str(form, "alt")), colorId: opt(form, "colorId"), kind: str(form, "kind") as Prisma.ProductImageUpdateInput["kind"], isConcept: bool(form, "isConcept") },
    });
    revalidatePath(`/admin/products/${img.productId}`);
  }, "Image updated.");
}

export async function moveImageAction(id: string, dir: -1 | 1) {
  return runAction(async () => {
    await requirePermission("catalog.write");
    const img = await db.productImage.findUniqueOrThrow({ where: { id } });
    const all = await db.productImage.findMany({ where: { productId: img.productId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const i = all.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j]!, all[i]!];
    await db.$transaction(all.map((x, n) => db.productImage.update({ where: { id: x.id }, data: { sortOrder: n } })));
    revalidatePath(`/admin/products/${img.productId}`);
  });
}

export async function deleteImageAction(id: string) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const img = await db.productImage.delete({ where: { id } });
    await deleteStoredImage(img.storageKey);
    await audit({ actorId: u.id, action: "image.delete", entityType: "Product", entityId: img.productId, before: { url: img.url } });
    revalidatePath(`/admin/products/${img.productId}`);
  });
}

// ─────────────────────────── Collections & categories ───────────────────────────

export async function saveCollectionAction(_p: unknown, form: FormData) {
  let createdId = "";
  const r = await runAction(async () => {
    const u = await requirePermission("catalog.write");
    const id = opt(form, "id");
    const title = z.string().min(2).max(80).parse(str(form, "title"));
    const type = z.enum(["MANUAL", "RULE"]).parse(str(form, "type") || "MANUAL");
    const linkType = z.enum(["PRODUCTS", "EDITORIAL"]).parse(str(form, "linkType") || "PRODUCTS");
    const data = {
      title,
      slug: z.string().regex(slugRe, "Use lowercase letters, numbers and dashes").parse(str(form, "slug") || slugify(title)),
      eyebrow: opt(form, "eyebrow"),
      description: opt(form, "description"),
      content: opt(form, "content"),
      heroImageUrl: optImage(opt(form, "heroImageUrl")),
      mobileImageUrl: optImage(opt(form, "mobileImageUrl")),
      imageAlt: opt(form, "imageAlt"),
      type,
      rules: type === "RULE" ? ({ categorySlugs: list(form, "ruleCategories"), tags: list(form, "ruleTags") } as Prisma.InputJsonValue) : undefined,
      linkType,
      editorialHref: linkType === "EDITORIAL" ? z.string().startsWith("/", "Use a site path like /lookbook").parse(str(form, "editorialHref")) : null,
      sortOrder: intOrNull(form, "sortOrder") ?? 0,
      showInExplore: bool(form, "showInExplore"),
      seoTitle: opt(form, "seoTitle"),
      seoDescription: opt(form, "seoDescription"),
    };
    if (id) await db.collection.update({ where: { id }, data });
    else createdId = (await db.collection.create({ data: { ...data, status: "DRAFT" } })).id;
    await audit({ actorId: u.id, action: id ? "collection.update" : "collection.create", entityType: "Collection", entityId: id ?? createdId, after: data });
    revalidatePath("/admin/collections");
  }, "Collection saved.");
  if (r.ok && createdId) redirect(`/admin/collections/${createdId}`);
  return r;
}

export async function setCollectionStatusAction(id: string, status: "DRAFT" | "ACTIVE" | "ARCHIVED", publishAtRaw?: string) {
  return runAction(async () => {
    const u = await requirePermission("catalog.publish");
    const fd = new FormData();
    if (publishAtRaw) fd.set("publishAt", publishAtRaw);
    const c = await db.collection.update({ where: { id }, data: { status, publishAt: status === "ACTIVE" ? istDate(fd, "publishAt") : null } });
    await audit({ actorId: u.id, action: "collection.status", entityType: "Collection", entityId: id, after: { status } });
    pingIndexNow([`/collections/${c.slug}`, "/collections"]);
    revalidatePath(`/admin/collections/${id}`);
  }, "Status updated.");
}

export async function setCollectionProductsAction(collectionId: string, productIds: string[]) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const ids = z.array(z.string()).max(200).parse(productIds);
    await db.$transaction([
      db.collectionProduct.deleteMany({ where: { collectionId } }),
      db.collectionProduct.createMany({ data: ids.map((productId, i) => ({ collectionId, productId, sortOrder: i })) }),
    ]);
    for (const pid of ids) await refreshSearchText(pid);
    await audit({ actorId: u.id, action: "collection.products", entityType: "Collection", entityId: collectionId, after: { productIds: ids } });
    revalidatePath(`/admin/collections/${collectionId}`);
  }, "Products updated.");
}

export async function saveCategoryAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const id = opt(form, "id");
    const name = z.string().min(2).max(40).parse(str(form, "name"));
    const data = {
      name,
      slug: z.string().regex(slugRe).parse(str(form, "slug") || slugify(name)),
      description: opt(form, "description"),
      content: opt(form, "content"),
      imageUrl: optImage(opt(form, "imageUrl")),
      imageAlt: opt(form, "imageAlt"),
      sortOrder: intOrNull(form, "sortOrder") ?? 0,
      isActive: bool(form, "isActive"),
      showOnHome: bool(form, "showOnHome"),
      seoTitle: opt(form, "seoTitle"),
      seoDescription: opt(form, "seoDescription"),
    };
    if (id) await db.category.update({ where: { id }, data });
    else await db.category.create({ data });
    await audit({ actorId: u.id, action: id ? "category.update" : "category.create", entityType: "Category", entityId: id, after: data });
    revalidatePath("/admin/categories");
  }, "Category saved.");
}

/** Generic CMS/collection image upload; returns the stored URL for a form field. */
export async function uploadMediaAction(form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("content.manage").catch(() => requirePermission("catalog.write"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("NO_FILE", "Choose an image.");
    const img = await storeImage(file, { folder: (str(form, "folder") || "cms") as "cms" | "collections", uploadedBy: u.id });
    return { url: img.url, width: img.width, height: img.height };
  });
}
