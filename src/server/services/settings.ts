import "server-only";
import { cache } from "react";
import { z } from "zod";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Typed, admin-editable store settings. Defaults deliberately leave business
 * facts (legal name, GSTIN, contact details, shipping rates, return window)
 * EMPTY so the storefront never shows invented information.
 */
const url = z.string().trim().url().or(z.literal("")).default("");
const optInt = z.number().int().min(0).nullable().default(null);

export const settingsSchemas = {
  store: z.object({
    brandName: z.string().default("QOWL"),
    tagline: z.string().default("Wear Your Own Code."),
    description: z.string().default("Independent streetwear for those who write their own code."),
    establishedLine: z.string().default(""),
    legalName: z.string().default(""),
    gstin: z.string().regex(/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN format").default(""),
    sellerState: z.string().default(""),
    registeredAddress: z.string().default(""),
    supportEmail: z.string().email().or(z.literal("")).default(SUPPORT_EMAIL),
    supportPhone: z.string().default(""),
    supportHours: z.string().default(""),
    grievanceOfficerName: z.string().default(""),
    grievanceOfficerDesignation: z.string().default(""),
    grievanceOfficerEmail: z.string().email().or(z.literal("")).default(SUPPORT_EMAIL),
    grievanceOfficerPhone: z.string().default(""),
  }),
  social: z.object({ instagram: url, youtube: url, pinterest: url, x: url, facebook: url }),
  shipping: z.object({
    // null = not configured -> checkout is blocked until an admin sets rates.
    flatRatePaise: optInt,
    freeShippingThresholdPaise: optInt,
    serviceablePincodePrefixes: z.array(z.string().regex(/^[1-9][0-9]{0,5}$/)).default([]),
    blockedPincodes: z.array(z.string().regex(/^[1-9][0-9]{5}$/)).default([]),
    deliverAllIndia: z.boolean().default(false),
    estimateMinDays: optInt,
    estimateMaxDays: optInt,
    dispatchNote: z.string().default(""),
    defaultWeightGrams: z.number().int().min(50).max(5000).default(400),
  }),
  returns: z.object({
    allowReturns: z.boolean().default(false),
    allowExchanges: z.boolean().default(false),
    windowDays: optInt,
    requirePhotos: z.boolean().default(false),
    reasons: z.array(z.string()).default(["Size too small", "Size too large", "Received a damaged item", "Received the wrong item", "Quality not as expected", "Changed my mind"]),
    policySummary: z.string().default(""),
  }),
  payments: z.object({
    onlineEnabled: z.boolean().default(true),
    codEnabled: z.boolean().default(false),
    codMinOrderPaise: optInt,
    codMaxOrderPaise: optInt,
    codFeePaise: z.number().int().min(0).default(0),
    codPincodePrefixes: z.array(z.string().regex(/^[1-9][0-9]{0,5}$/)).default([]),
    codBlockedPincodes: z.array(z.string().regex(/^[1-9][0-9]{5}$/)).default([]),
    codMaxOpenOrdersPerPhone: z.number().int().min(1).max(10).default(2),
  }),
  tax: z.object({
    invoicePrefix: z.string().max(10).default("QWL"),
    invoiceFooter: z.string().default(""),
    // Prices entered in admin are GST-inclusive (MRP convention).
    shippingTaxMode: z.enum(["HIGHEST_LINE_RATE", "NONE"]).default("HIGHEST_LINE_RATE"),
    reviewedByAdvisor: z.boolean().default(false),
  }),
  seo: z.object({
    defaultTitle: z.string().default("QOWL | Indian Streetwear: Oversized T-shirts & Hoodies"),
    titleTemplate: z.string().default("%s | QOWL"),
    defaultDescription: z.string().default("QOWL is an independent Indian streetwear label: oversized T-shirts and pullover hoodies with original, gothic-inspired artwork, released in small numbered drops. Shop Drop 001: The Unwritten."),
    ogImageUrl: z.string().default(""),
  }),
  newsletter: z.object({
    heading: z.string().default("Enter the QOWL World"),
    subheading: z.string().default("Be the first to know about new drops, restocks and exclusive releases."),
    consentText: z.string().default("I agree to receive emails from QOWL about new drops and releases. I can unsubscribe at any time."),
    doubleOptIn: z.boolean().default(true),
  }),
  launch: z.object({
    // Shown on product pages while catalogue imagery consists of concept renders.
    conceptImageNotice: z.string().default("Concept render — final garment photography will replace this image."),
  }),
} as const;

export type SettingsKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingsKey]: z.infer<(typeof settingsSchemas)[K]> };

export function parseSetting<K extends SettingsKey>(key: K, raw: unknown): Settings[K] {
  const res = settingsSchemas[key].safeParse(raw ?? {});
  if (res.success) return res.data as Settings[K];
  // Corrupt/legacy value: fall back to defaults rather than crash the storefront.
  return settingsSchemas[key].parse({}) as Settings[K];
}

export async function loadSettings(): Promise<Settings> {
  const rows = await db.siteSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(settingsSchemas) as SettingsKey[]) out[key] = parseSetting(key, map.get(key));
  return out as Settings;
}

export const getSettings = cache(loadSettings);

export async function getSetting<K extends SettingsKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

/** Validates and persists one settings group. Throws ZodError on invalid input. */
export async function saveSetting<K extends SettingsKey>(key: K, value: unknown, actorId?: string): Promise<Settings[K]> {
  const parsed = settingsSchemas[key].parse(value) as Settings[K];
  await db.siteSetting.upsert({
    where: { key },
    create: { key, value: parsed as Prisma.InputJsonValue, updatedById: actorId },
    update: { value: parsed as Prisma.InputJsonValue, updatedById: actorId },
  });
  return parsed;
}
