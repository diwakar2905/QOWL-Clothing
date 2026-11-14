import { z } from "zod";

/** Per-type schemas for HomepageSection.data. Unknown fields are stripped. */
const href = z.string().trim().max(300).refine((v) => v === "" || v.startsWith("/") || v.startsWith("https://"), "Use a site path (/...) or https:// URL");
const img = z.string().trim().max(500).default("");

export const sectionDataSchemas = {
  HERO: z.object({ autoplay: z.boolean().default(false), intervalSeconds: z.number().int().min(4).max(20).default(7) }),
  MARQUEE: z.object({ items: z.array(z.string().trim().min(1).max(40)).max(8).default(["Designed to differ"]) }),
  PRODUCT_GRID: z.object({
    eyebrow: z.string().max(60).default(""),
    heading: z.string().max(80).default("The First Six"),
    subheading: z.string().max(200).default(""),
    mode: z.enum(["featured", "collection", "manual"]).default("featured"),
    collectionSlug: z.string().max(80).default(""),
    productIds: z.array(z.string()).max(24).default([]),
    limit: z.number().int().min(1).max(24).default(6),
  }),
  CAMPAIGN: z.object({
    heading: z.string().max(80).default("Not Made To Blend In"),
    body: z.string().max(300).default(""),
    ctaLabel: z.string().max(40).default(""),
    ctaHref: href.default(""),
    imageUrl: img,
    mobileImageUrl: img,
    imageAlt: z.string().max(200).default(""),
    isConcept: z.boolean().default(false),
  }),
  CATEGORY_TILES: z.object({
    tiles: z
      .array(z.object({ eyebrow: z.string().max(30).default("Shop"), label: z.string().min(1).max(40), href, imageUrl: img, imageAlt: z.string().max(200).default(""), isConcept: z.boolean().default(false) }))
      .max(6)
      .default([]),
  }),
  CRAFT: z.object({
    heading: z.string().max(80).default("Built With Intention"),
    body: z.string().max(300).default(""),
    items: z
      .array(z.object({ title: z.string().min(1).max(40), detail: z.string().max(80).default(""), imageUrl: img, imageAlt: z.string().max(200).default(""), isConcept: z.boolean().default(false), approved: z.boolean().default(false) }))
      .max(6)
      .default([]),
  }),
  LOOKBOOK: z.object({
    eyebrow: z.string().max(40).default("Lookbook"),
    heading: z.string().max(80).default("The Unwritten Journal"),
    body: z.string().max(200).default(""),
    ctaLabel: z.string().max(40).default("View Lookbook"),
    ctaHref: href.default("/lookbook"),
    limit: z.number().int().min(1).max(6).default(3),
  }),
  NEWSLETTER: z.object({}),
} as const;

export type SectionType = keyof typeof sectionDataSchemas;
export type SectionData<T extends SectionType> = z.infer<(typeof sectionDataSchemas)[T]>;

export function parseSectionData<T extends SectionType>(type: T, raw: unknown): SectionData<T> {
  const r = sectionDataSchemas[type].safeParse(raw ?? {});
  return (r.success ? r.data : sectionDataSchemas[type].parse({})) as SectionData<T>;
}
