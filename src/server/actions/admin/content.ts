"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { runAction } from "@/server/api";
import { requirePermission } from "@/server/auth/session";
import { audit } from "@/server/services/audit";
import { sectionDataSchemas, type SectionType } from "@/server/cms/sections";
import { saveSetting, settingsSchemas, type SettingsKey } from "@/server/services/settings";
import { hashPassword } from "@/server/auth/password";
import { isPermission } from "@/server/auth/permissions";
import { passwordSchema, emailSchema } from "@/lib/validation";
import { str, opt, bool, intOrNull, istDate } from "./_util";

const hrefSchema = z.string().trim().max(300).refine((v) => v === "" || v.startsWith("/") || v.startsWith("https://"), "Use a site path (/...) or https:// URL");

function revalidateStore() {
  revalidatePath("/", "layout");
}

// ─────────────────────────────── Homepage ────────────────────────────────

export async function saveSectionAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("content.manage");
    const id = str(form, "id");
    const section = await db.homepageSection.findUniqueOrThrow({ where: { id } });
    let raw: unknown;
    try {
      raw = JSON.parse(str(form, "data") || "{}");
    } catch {
      throw new AppError("BAD_JSON", "Section data is malformed.");
    }
    const data = sectionDataSchemas[section.type as SectionType].parse(raw);
    await db.homepageSection.update({ where: { id }, data: { data: data as Prisma.InputJsonValue, label: str(form, "label") || section.label, isVisible: bool(form, "isVisible") } });
    await audit({ actorId: u.id, action: "cms.section.update", entityType: "HomepageSection", entityId: id, before: section.data, after: data });
    revalidateStore();
  }, "Section saved.");
}

export async function moveSectionAction(id: string, dir: -1 | 1) {
  return runAction(async () => {
    await requirePermission("content.manage");
    const all = await db.homepageSection.findMany({ orderBy: { sortOrder: "asc" } });
    const i = all.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j]!, all[i]!];
    await db.$transaction(all.map((s, n) => db.homepageSection.update({ where: { id: s.id }, data: { sortOrder: n } })));
    revalidateStore();
  });
}

export async function toggleSectionAction(id: string, isVisible: boolean) {
  return runAction(async () => {
    const u = await requirePermission("content.manage");
    await db.homepageSection.update({ where: { id }, data: { isVisible } });
    await audit({ actorId: u.id, action: "cms.section.visibility", entityType: "HomepageSection", entityId: id, after: { isVisible } });
    revalidateStore();
  });
}

export async function saveHeroSlideAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("content.manage");
    const id = opt(form, "id");
    const data = {
      eyebrow: opt(form, "eyebrow"),
      heading: z.string().min(1).max(60).parse(str(form, "heading")),
      subheading: opt(form, "subheading"),
      desktopImageUrl: z.string().min(1, "Upload a desktop image").parse(str(form, "desktopImageUrl")),
      mobileImageUrl: opt(form, "mobileImageUrl"),
      imageAlt: z.string().min(3, "Describe the image").max(200).parse(str(form, "imageAlt")),
      isConcept: bool(form, "isConcept"),
      primaryLabel: opt(form, "primaryLabel"),
      primaryHref: hrefSchema.parse(str(form, "primaryHref")) || null,
      secondaryLabel: opt(form, "secondaryLabel"),
      secondaryHref: hrefSchema.parse(str(form, "secondaryHref")) || null,
      sideLabels: str(form, "sideLabels").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4),
      sortOrder: intOrNull(form, "sortOrder") ?? 0,
      isActive: bool(form, "isActive"),
      startsAt: istDate(form, "startsAt"),
      endsAt: istDate(form, "endsAt"),
    };
    const s = id ? await db.heroSlide.update({ where: { id }, data }) : await db.heroSlide.create({ data });
    await audit({ actorId: u.id, action: id ? "cms.hero.update" : "cms.hero.create", entityType: "HeroSlide", entityId: s.id, after: data });
    revalidateStore();
  }, "Hero slide saved.");
}

export async function deleteHeroSlideAction(id: string) {
  return runAction(async () => {
    const u = await requirePermission("content.manage");
    await db.heroSlide.delete({ where: { id } });
    await audit({ actorId: u.id, action: "cms.hero.delete", entityType: "HeroSlide", entityId: id });
    revalidateStore();
  });
}

export async function saveAnnouncementAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("content.manage");
    const id = opt(form, "id");
    const data = {
      message: z.string().min(3).max(140).parse(str(form, "message")),
      href: hrefSchema.parse(str(form, "href")) || null,
      isActive: bool(form, "isActive"),
      startsAt: istDate(form, "startsAt"),
      endsAt: istDate(form, "endsAt"),
      sortOrder: intOrNull(form, "sortOrder") ?? 0,
    };
    const a = id ? await db.announcement.update({ where: { id }, data }) : await db.announcement.create({ data });
    await audit({ actorId: u.id, action: "cms.announcement.save", entityType: "Announcement", entityId: a.id, after: data });
    revalidateStore();
  }, "Announcement saved.");
}

export async function deleteAnnouncementAction(id: string) {
  return runAction(async () => {
    await requirePermission("content.manage");
    await db.announcement.delete({ where: { id } });
    revalidateStore();
  });
}

export async function saveLookbookImageAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("content.manage");
    const id = opt(form, "id");
    const data = {
      imageUrl: z.string().min(1, "Upload an image").parse(str(form, "imageUrl")),
      alt: z.string().min(3, "Describe the image").max(200).parse(str(form, "alt")),
      caption: opt(form, "caption"),
      productId: opt(form, "productId"),
      isConcept: bool(form, "isConcept"),
      sortOrder: intOrNull(form, "sortOrder") ?? 0,
      isActive: bool(form, "isActive"),
    };
    const l = id ? await db.lookbookImage.update({ where: { id }, data }) : await db.lookbookImage.create({ data });
    await audit({ actorId: u.id, action: "cms.lookbook.save", entityType: "LookbookImage", entityId: l.id });
    revalidateStore();
  }, "Lookbook image saved.");
}

export async function deleteLookbookImageAction(id: string) {
  return runAction(async () => {
    await requirePermission("content.manage");
    await db.lookbookImage.delete({ where: { id } });
    revalidateStore();
  });
}

export async function savePageAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("content.manage");
    const id = opt(form, "id");
    const title = z.string().min(2).max(80).parse(str(form, "title"));
    const status = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).parse(str(form, "status"));
    // Legal pages go live only with settings permission (business sign-off).
    if (status === "ACTIVE") await requirePermission("settings.manage").catch(() => { throw new AppError("FORBIDDEN", "Publishing policy pages requires Settings permission (legal sign-off).", 403); });
    const data = {
      title,
      slug: z.string().regex(/^[a-z0-9-]+$/).parse(str(form, "slug") || slugify(title)),
      body: z.string().min(10).max(50000).parse(str(form, "body")),
      status,
      showInFooter: bool(form, "showInFooter"),
      footerGroup: z.enum(["help", "legal"]).parse(str(form, "footerGroup") || "help"),
      sortOrder: intOrNull(form, "sortOrder") ?? 0,
      seoDescription: opt(form, "seoDescription"),
    };
    const p = id ? await db.page.update({ where: { id }, data }) : await db.page.create({ data });
    await audit({ actorId: u.id, action: "page.save", entityType: "Page", entityId: p.id, after: { title, status } });
    revalidateStore();
  }, "Page saved.");
}

// ─────────────────────────────── Settings ────────────────────────────────

export async function saveSettingsAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("settings.manage");
    const key = z.enum(Object.keys(settingsSchemas) as [SettingsKey, ...SettingsKey[]]).parse(str(form, "key"));
    let raw: unknown;
    try {
      raw = JSON.parse(str(form, "value"));
    } catch {
      throw new AppError("BAD_JSON", "Malformed settings payload.");
    }
    const { getSettings } = await import("@/server/services/settings");
    const before = (await getSettings())[key];
    const saved = await saveSetting(key, raw, u.id);
    await audit({ actorId: u.id, action: `settings.${key}`, entityType: "SiteSetting", entityId: key, before, after: saved });
    revalidateStore();
  }, "Settings saved.");
}

export async function saveTaxClassAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("settings.manage");
    const id = opt(form, "id");
    const pct = (k: string) => {
      const v = str(form, k);
      if (!v) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 40) throw new AppError("VALIDATION", "GST rates must be between 0 and 40%.");
      return Math.round(n * 100);
    };
    const threshold = str(form, "threshold");
    const data = {
      name: z.string().min(2).max(80).parse(str(form, "name")),
      hsnCode: z.string().regex(/^\d{4,8}$/, "HSN must be 4–8 digits").parse(str(form, "hsnCode")),
      rateBps: pct("rate") ?? 0,
      upperRateBps: pct("upperRate"),
      thresholdPaise: threshold ? Math.round(Number(threshold) * 100) : null,
      notes: opt(form, "notes"),
      reviewedAt: bool(form, "reviewed") ? new Date() : null,
    };
    const t = id ? await db.taxClass.update({ where: { id }, data }) : await db.taxClass.create({ data });
    await audit({ actorId: u.id, action: "tax_class.save", entityType: "TaxClass", entityId: t.id, after: data });
    revalidatePath("/admin/settings");
  }, "Tax class saved.");
}

export async function saveEmailTemplateAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("settings.manage");
    const key = str(form, "key");
    const data = { subject: z.string().min(3).max(200).parse(str(form, "subject")), body: z.string().min(10).max(5000).parse(str(form, "body")), isActive: bool(form, "isActive") };
    await db.emailTemplate.update({ where: { key }, data });
    await audit({ actorId: u.id, action: "email_template.save", entityType: "EmailTemplate", entityId: key });
    revalidatePath("/admin/settings");
  }, "Template saved.");
}

export async function saveSizeGuideAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("catalog.write");
    const id = opt(form, "id");
    const columns = str(form, "columns").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 6);
    const rows = str(form, "rows")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [size, ...vals] = l.split(",").map((x) => x.trim());
        const row: Record<string, string | number> = { size: size! };
        columns.forEach((c, i) => {
          const n = Number(vals[i]);
          row[c] = Number.isFinite(n) ? n : vals[i] ?? "";
        });
        return row;
      });
    if (!rows.length) throw new AppError("VALIDATION", "Enter at least one size row.");
    const data = { name: z.string().min(2).max(80).parse(str(form, "name")), unit: z.enum(["in", "cm"]).parse(str(form, "unit") || "in"), columns, rows: rows as Prisma.InputJsonValue, fitNotes: opt(form, "fitNotes"), modelInfo: opt(form, "modelInfo"), isApproved: bool(form, "isApproved") };
    const g = id ? await db.sizeGuide.update({ where: { id }, data }) : await db.sizeGuide.create({ data });
    await audit({ actorId: u.id, action: "size_guide.save", entityType: "SizeGuide", entityId: g.id });
    revalidatePath("/admin/settings");
  }, "Size guide saved.");
}

// ───────────────────────────── Staff & roles ─────────────────────────────

export async function saveStaffAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("staff.manage");
    const id = opt(form, "id");
    const roleId = opt(form, "roleId");
    if (id === u.id && roleId !== (await db.user.findUniqueOrThrow({ where: { id } })).roleId) throw new AppError("SELF", "You can't change your own role.", 409);
    if (id) {
      await db.user.update({ where: { id }, data: { roleId, name: opt(form, "name"), status: bool(form, "disabled") ? "SUSPENDED" : "ACTIVE" } });
      if (!roleId || bool(form, "disabled")) await db.session.deleteMany({ where: { userId: id } });
      await audit({ actorId: u.id, action: "staff.update", entityType: "User", entityId: id, after: { roleId, disabled: bool(form, "disabled") } });
    } else {
      const email = emailSchema.parse(str(form, "email"));
      const password = passwordSchema.parse(str(form, "password"));
      if (!roleId) throw new AppError("VALIDATION", "Choose a role.");
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        await db.user.update({ where: { id: existing.id }, data: { roleId } });
        await db.session.deleteMany({ where: { userId: existing.id } });
      } else {
        await db.user.create({ data: { email, name: opt(form, "name"), passwordHash: await hashPassword(password), roleId, emailVerifiedAt: new Date() } });
      }
      await audit({ actorId: u.id, action: "staff.create", entityType: "User", summary: email, after: { roleId } });
    }
    revalidatePath("/admin/staff");
  }, "Staff saved.");
}

export async function saveRoleAction(_p: unknown, form: FormData) {
  return runAction(async () => {
    const u = await requirePermission("staff.manage");
    const id = opt(form, "id");
    const permissions = form.getAll("permissions").map(String).filter(isPermission);
    const name = z.string().min(2).max(40).parse(str(form, "name"));
    if (id) {
      const role = await db.role.findUniqueOrThrow({ where: { id } });
      if (role.key === "super_admin") throw new AppError("PROTECTED", "The Super Admin role always has every permission.", 409);
      await db.role.update({ where: { id }, data: { name, permissions, description: opt(form, "description") } });
    } else {
      await db.role.create({ data: { key: slugify(name).replace(/-/g, "_"), name, permissions, description: opt(form, "description") } });
    }
    await audit({ actorId: u.id, action: "role.save", entityType: "Role", entityId: id, after: { name, permissions } });
    revalidatePath("/admin/staff");
  }, "Role saved.");
}
