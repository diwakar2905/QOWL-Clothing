/**
 * QOWL seed.
 *
 *   npm run db:seed                      base setup only (safe for production)
 *   SEED_FIXTURES=true npm run db:seed   + development fixtures (refused in production)
 *
 * Base setup: staff roles, a GST tax class that MUST be reviewed by a tax
 * advisor, email templates, homepage CMS structure with the approved brand
 * copy, DRAFT legal page skeletons, and the six DROP 001 products as DRAFTS
 * with zero stock and provisional (unapproved) specifications.
 *
 * Fixtures (development only): products ACTIVE with fixture stock, concept
 * imagery, collections, coupons, store settings, and test accounts.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { SYSTEM_ROLES } from "../src/server/auth/permissions";
import { DEFAULT_TEMPLATES } from "../src/server/notifications/templates";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const FIXTURES = process.env.SEED_FIXTURES === "true";
const PROD = process.env.NODE_ENV === "production";

if (FIXTURES && PROD) {
  console.error("Refusing to load development fixtures with NODE_ENV=production.");
  process.exit(1);
}

const SIZES = ["S", "M", "L", "XL", "XXL"];
const C = (file: string) => `/concept/${file}.webp`;
const HERO_ALT = "Model in a washed black QOWL hoodie, wide-leg black denim, cap and green sneakers, standing in green mist";

type Fixture = {
  name: string;
  slug: string;
  styleCode: string;
  subtitle: string;
  category: "t-shirts" | "hoodies";
  garmentType: string;
  price: number;
  design: string;
  fabricTarget: string;
  gsm: string;
  fit: string;
  colors: { name: string; slug: string; hex: string; images: { file: string; kind: "FRONT" | "BACK" | "SIDE" | "DETAIL" | "FABRIC" | "MODEL"; alt: string }[] }[];
  tags: string[];
  story?: string;
};

const PRODUCTS: Fixture[] = [
  {
    name: "Origin", slug: "origin", styleCode: "QWL-TS-001", subtitle: "The Essential Tee", category: "t-shirts", garmentType: "Oversized T-shirt", price: 99900,
    design: "Minimal QOWL chest monogram.", fabricTarget: "Cotton jersey (target 220–240 GSM)", gsm: "220–240 (target)", fit: "Oversized",
    tags: ["essentials", "monogram", "drop-001"],
    colors: [
      { name: "Burgundy", slug: "burgundy", hex: "#5E1A22", images: [
        { file: "origin-front", kind: "MODEL", alt: "Model wearing the Origin oversized tee in burgundy with a small QOWL chest monogram" },
        { file: "six-origin", kind: "FRONT", alt: "Origin tee in burgundy, front view" },
        { file: "origin-alt", kind: "MODEL", alt: "Origin tee in burgundy styled with a chain necklace" },
        { file: "tile-origin", kind: "SIDE", alt: "Origin tee in burgundy, seated side view" },
      ] },
      { name: "Black", slug: "black", hex: "#151515", images: [] },
    ],
  },
  {
    name: "Requiem", slug: "requiem", styleCode: "QWL-TS-002", subtitle: "The Statement Tee", category: "t-shirts", garmentType: "Oversized T-shirt", price: 129900,
    design: "Signature large gothic-inspired back artwork.", fabricTarget: "Cotton jersey (target 240 GSM)", gsm: "240 (target)", fit: "Oversized",
    tags: ["statement", "graphic", "back-print", "drop-001"],
    colors: [
      { name: "Washed Charcoal", slug: "washed-charcoal", hex: "#3B3B3B", images: [
        { file: "requiem-back", kind: "BACK", alt: "Back of the Requiem tee in washed charcoal showing the winged gothic artwork" },
        { file: "six-requiem", kind: "BACK", alt: "Requiem tee back artwork, full view" },
        { file: "tile-requiem", kind: "MODEL", alt: "Requiem tee in washed charcoal photographed against cathedral stonework" },
      ] },
      { name: "Forest Green", slug: "forest-green", hex: "#1F3B2E", images: [] },
    ],
  },
  {
    name: "Phantom", slug: "phantom", styleCode: "QWL-TS-003", subtitle: "The Contrast Tee", category: "t-shirts", garmentType: "Oversized T-shirt", price: 119900,
    design: "Asymmetric original line artwork.", fabricTarget: "Cotton jersey (target 220–240 GSM)", gsm: "220–240 (target)", fit: "Oversized",
    tags: ["statement", "graphic", "drop-001"],
    colors: [
      { name: "Bone White", slug: "bone-white", hex: "#E8E2D3", images: [
        { file: "phantom-front", kind: "MODEL", alt: "Model in the Phantom tee in bone white with asymmetric thorn line artwork" },
        { file: "six-phantom", kind: "FRONT", alt: "Phantom tee in bone white, front view" },
        { file: "phantom-alt", kind: "MODEL", alt: "Phantom tee in bone white styled with layered necklaces" },
        { file: "tile-phantom", kind: "SIDE", alt: "Phantom tee artwork detail on the hem" },
      ] },
      { name: "Slate Blue", slug: "slate-blue", hex: "#4B5B6E", images: [] },
    ],
  },
  {
    name: "Nocturne", slug: "nocturne", styleCode: "QWL-HD-001", subtitle: "The Essential Hoodie", category: "hoodies", garmentType: "Pullover hoodie", price: 189900,
    design: "Small QOWL embroidery.", fabricTarget: "Cotton-blend fleece (target 350 GSM)", gsm: "350 (target)", fit: "Relaxed",
    tags: ["essentials", "embroidery", "drop-001"],
    colors: [
      { name: "Mocha Brown", slug: "mocha-brown", hex: "#4A2E24", images: [
        { file: "nocturne-front", kind: "MODEL", alt: "Model wearing the Nocturne hoodie in mocha brown with small QOWL embroidery" },
        { file: "six-nocturne", kind: "FRONT", alt: "Nocturne hoodie in mocha brown, front view" },
      ] },
      { name: "Black", slug: "black", hex: "#141414", images: [] },
    ],
  },
  {
    name: "Eclipse", slug: "eclipse", styleCode: "QWL-HD-002", subtitle: "The Statement Hoodie", category: "hoodies", garmentType: "Pullover hoodie", price: 219900,
    design: "Eclipse-inspired back artwork — a contrast of ruin and rebirth.", fabricTarget: "Cotton-blend fleece (target 350–380 GSM)", gsm: "350–380 (target)", fit: "Oversized / boxy",
    tags: ["statement", "graphic", "back-print", "drop-001"],
    story: "Eclipse blurs the line between what's lost and what's next. A statement piece from DROP 001 — built for those who find beauty in contrast.",
    colors: [
      { name: "Forest Green", slug: "forest-green", hex: "#173A2C", images: [
        { file: "eclipse-front", kind: "FRONT", alt: "Eclipse hoodie in forest green, front view with QOWL chest wordmark" },
        { file: "eclipse-back-full", kind: "BACK", alt: "Eclipse hoodie back artwork: an eclipse over ruined columns" },
        { file: "eclipse-hood", kind: "SIDE", alt: "Eclipse hoodie worn with the hood up" },
        { file: "eclipse-standing", kind: "MODEL", alt: "Full-length styling of the Eclipse hoodie with wide-leg trousers" },
        { file: "eclipse-chest", kind: "DETAIL", alt: "Close-up of the QOWL chest wordmark on the Eclipse hoodie" },
        { file: "eclipse-fabric", kind: "FABRIC", alt: "Close-up of the Eclipse hoodie fleece" },
        { file: "eclipse-artwork-close", kind: "DETAIL", alt: "Close-up of the eclipse and column back artwork" },
      ] },
      { name: "Washed Charcoal", slug: "washed-charcoal", hex: "#4A4A48", images: [] },
      { name: "Burgundy", slug: "burgundy", hex: "#4E1820", images: [] },
    ],
  },
  {
    name: "Ashen", slug: "ashen", styleCode: "QWL-HD-003", subtitle: "The Experimental Hoodie", category: "hoodies", garmentType: "Pullover hoodie", price: 249900,
    design: "Sleeve artwork and custom detailing.", fabricTarget: "Cotton-blend fleece (target 380 GSM)", gsm: "380 (target)", fit: "Oversized",
    tags: ["experimental", "graphic", "drop-001"],
    colors: [
      { name: "Dusty Lavender", slug: "dusty-lavender", hex: "#A08FB3", images: [
        { file: "ashen-front", kind: "MODEL", alt: "Model in the Ashen hoodie in dusty lavender with starburst line artwork" },
        { file: "six-ashen", kind: "FRONT", alt: "Ashen hoodie in dusty lavender, front view" },
        { file: "ashen-alt", kind: "MODEL", alt: "Ashen hoodie in dusty lavender worn with the hood up" },
        { file: "detail-construction", kind: "DETAIL", alt: "Close-up of the Ashen starburst stitch detail" },
      ] },
      { name: "Stone Grey", slug: "stone-grey", hex: "#8E8B85", images: [] },
      { name: "Cobalt Blue", slug: "cobalt-blue", hex: "#2B4C9B", images: [] },
    ],
  },
];

async function base() {
  for (const [key, r] of Object.entries(SYSTEM_ROLES)) {
    await db.role.upsert({ where: { key }, create: { key, name: r.name, description: r.description, permissions: r.permissions, isSystem: true }, update: { name: r.name, description: r.description, permissions: r.permissions, isSystem: true } });
  }
  for (const [key, t] of Object.entries(DEFAULT_TEMPLATES)) {
    await db.emailTemplate.upsert({ where: { key }, create: { key, ...t }, update: { name: t.name } });
  }
  await db.taxClass.upsert({
    where: { name: "Apparel (GST) — REVIEW REQUIRED" },
    create: {
      name: "Apparel (GST) — REVIEW REQUIRED",
      hsnCode: "6109",
      rateBps: 500,
      upperRateBps: 1800,
      thresholdPaise: 250000,
      notes: "Provisional: 5% up to ₹2,500 per piece, 18% above (GST rationalisation effective 22 Sep 2025). HSN 6109 = T-shirts (knitted); hoodies/sweatshirts are typically 6110. Confirm rates and HSN codes with a tax advisor, then mark reviewed.",
    },
    update: {},
  });
  await db.taxClass.upsert({
    where: { name: "Knitted sweatshirts/hoodies (GST) — REVIEW REQUIRED" },
    create: { name: "Knitted sweatshirts/hoodies (GST) — REVIEW REQUIRED", hsnCode: "6110", rateBps: 500, upperRateBps: 1800, thresholdPaise: 250000, notes: "Provisional — confirm with a tax advisor." },
    update: {},
  });

  const cats = [
    { slug: "t-shirts", name: "T-Shirts", description: "Oversized and regular-fit tees.", sortOrder: 1, imageUrl: C("category-tees"), imageAlt: "Model in a burgundy QOWL oversized tee" },
    { slug: "hoodies", name: "Hoodies", description: "Heavyweight pullover hoodies.", sortOrder: 2, imageUrl: C("category-hoodies"), imageAlt: "Model in a forest green QOWL hoodie with the hood up" },
    { slug: "sweatshirts", name: "Sweatshirts", description: "Crewneck sweatshirts.", sortOrder: 3, imageUrl: null, imageAlt: null, isActive: false },
  ];
  for (const c of cats) await db.category.upsert({ where: { slug: c.slug }, create: { ...c, showOnHome: c.slug !== "sweatshirts" }, update: {} });

  // Homepage structure with the approved brand copy.
  const sections: { key: string; type: Prisma.HomepageSectionCreateInput["type"]; label: string; sortOrder: number; data: Prisma.InputJsonValue }[] = [
    { key: "hero", type: "HERO", label: "Hero", sortOrder: 0, data: { autoplay: false, intervalSeconds: 7 } },
    { key: "marquee", type: "MARQUEE", label: "Marquee", sortOrder: 1, data: { items: ["Designed to differ"] } },
    { key: "first-six", type: "PRODUCT_GRID", label: "The First Six", sortOrder: 2, data: { eyebrow: "Drop 001", heading: "The First Six", subheading: "A balanced blend of essentials, statements and experimentation.", mode: "collection", collectionSlug: "drop-001", limit: 6 } },
    { key: "campaign", type: "CAMPAIGN", label: "Campaign", sortOrder: 3, data: { heading: "Not Made To Blend In", body: "Independent streetwear for those who write their own code.", ctaLabel: "Shop Drop 001", ctaHref: "/collections/drop-001", imageUrl: C("campaign-duo"), mobileImageUrl: "", imageAlt: "Two models in QOWL forest green hoodie and burgundy tee in front of gothic arches", isConcept: true } },
    { key: "categories", type: "CATEGORY_TILES", label: "Category tiles", sortOrder: 4, data: { tiles: [
      { eyebrow: "Shop", label: "Oversized T-Shirts", href: "/collections/oversized-t-shirts", imageUrl: C("category-tees"), imageAlt: "Model in a burgundy QOWL oversized tee", isConcept: true },
      { eyebrow: "Shop", label: "Heavyweight Hoodies", href: "/collections/heavyweight-hoodies", imageUrl: C("category-hoodies"), imageAlt: "Model in a forest green QOWL hoodie with the hood up", isConcept: true },
    ] } },
    { key: "craft", type: "CRAFT", label: "Built With Intention", sortOrder: 5, data: { heading: "Built With Intention", body: "Every detail serves a purpose.", items: [
      { title: "Fabric selection", detail: "220–380 GSM targets", imageUrl: C("craft-fabric"), imageAlt: "Close-up of folded green fleece", isConcept: true, approved: FIXTURES },
      { title: "Signature embroidery", detail: "QOWL monogram", imageUrl: C("craft-embroidery"), imageAlt: "QOWL monogram embroidered on green fabric", isConcept: true, approved: FIXTURES },
      { title: "Construction", detail: "Detail in every seam", imageUrl: C("craft-construction"), imageAlt: "Close-up of a stitched seam", isConcept: true, approved: FIXTURES },
      { title: "Garment finishing", detail: "Washed character", imageUrl: C("craft-wash"), imageAlt: "Close-up of washed charcoal fabric texture", isConcept: true, approved: FIXTURES },
    ] } },
    { key: "lookbook", type: "LOOKBOOK", label: "Lookbook", sortOrder: 6, data: { eyebrow: "Lookbook", heading: "The Unwritten Journal", body: "A visual exploration of Drop 001.", ctaLabel: "View Lookbook", ctaHref: "/lookbook", limit: 3 } },
    { key: "newsletter", type: "NEWSLETTER", label: "Newsletter", sortOrder: 7, data: {} },
  ];
  for (const s of sections) await db.homepageSection.upsert({ where: { key: s.key }, create: s, update: {} });

  // Move stores still on the original placeholder hero to the Green Mist campaign image.
  await db.heroSlide.updateMany({
    where: { desktopImageUrl: C("hero-model") },
    data: { desktopImageUrl: C("hero-green-mist"), mobileImageUrl: C("hero-green-mist-mobile"), imageAlt: HERO_ALT, isConcept: false },
  });
  if (!(await db.heroSlide.count())) {
    await db.heroSlide.create({
      data: {
        eyebrow: "QOWL / Drop 001",
        heading: "The Unwritten",
        subheading: "Wear Your Own Code.",
        desktopImageUrl: C("hero-green-mist"),
        mobileImageUrl: C("hero-green-mist-mobile"),
        imageAlt: HERO_ALT,
        isConcept: false,
        primaryLabel: "Shop Drop 001",
        primaryHref: "/collections/drop-001",
        secondaryLabel: "Explore the Collection",
        secondaryHref: "/collections",
        sideLabels: ["Clothing", "Essentials"],
      },
    });
  }

  const legal = [
    { slug: "shipping-policy", title: "Shipping Policy", footerGroup: "help", sortOrder: 1 },
    { slug: "returns-and-exchanges", title: "Returns & Exchanges", footerGroup: "help", sortOrder: 2 },
    { slug: "privacy-policy", title: "Privacy Policy", footerGroup: "legal", sortOrder: 3 },
    { slug: "terms-of-service", title: "Terms of Service", footerGroup: "legal", sortOrder: 4 },
    { slug: "grievance-redressal", title: "Grievance Redressal", footerGroup: "help", sortOrder: 5 },
  ];
  for (const p of legal) {
    await db.page.upsert({
      where: { slug: p.slug },
      create: {
        ...p,
        status: FIXTURES ? "ACTIVE" : "DRAFT",
        body: `> DRAFT TEMPLATE — this page must be written and approved by QOWL (with legal review) before launch. It is not legal advice.\n\n## Overview\n\n[To be completed by QOWL.]\n\n## Contact\n\nCustomer care details are shown in the site footer once configured in Admin → Settings.`,
      },
      update: {},
    });
  }
}

async function catalog() {
  const tees = await db.taxClass.findUniqueOrThrow({ where: { name: "Apparel (GST) — REVIEW REQUIRED" } });
  const hood = await db.taxClass.findUniqueOrThrow({ where: { name: "Knitted sweatshirts/hoodies (GST) — REVIEW REQUIRED" } });
  let guide = null;
  if (FIXTURES) {
    guide = await db.sizeGuide.upsert({
      where: { name: "DEV FIXTURE — Oversized fit (not a real spec)" },
      create: {
        name: "DEV FIXTURE — Oversized fit (not a real spec)",
        unit: "in",
        columns: ["chest", "length", "shoulder", "sleeve"],
        rows: SIZES.map((s, i) => ({ size: s, chest: 44 + i * 2, length: 27.5 + i, shoulder: 21 + i * 0.75, sleeve: 9 + i * 0.25 })) as Prisma.InputJsonValue,
        fitNotes: "Development fixture values. Replace with approved garment measurements before launch.",
        isApproved: true,
      },
      update: {},
    });
  }
  for (const [pi, p] of PRODUCTS.entries()) {
    const category = await db.category.findUniqueOrThrow({ where: { slug: p.category } });
    const exists = await db.product.findUnique({ where: { slug: p.slug } });
    if (exists) continue;
    const description = `${p.design} ${p.garmentType} from DROP 001 — The Unwritten. Specifications, fabric and pricing are provisional until production samples are approved.`;
    const searchText = [p.name, p.styleCode, p.subtitle, category.name, ...p.colors.map((c) => c.name), ...p.tags, "drop 001", description].join(" ").toLowerCase();
    const product = await db.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        styleCode: p.styleCode,
        subtitle: p.subtitle,
        description,
        story: p.story,
        categoryId: category.id,
        garmentType: p.garmentType,
        status: FIXTURES ? "ACTIVE" : "DRAFT",
        publishedAt: FIXTURES ? new Date() : null,
        price: p.price,
        mrp: p.price,
        taxClassId: p.category === "hoodies" ? hood.id : tees.id,
        fabric: p.fabricTarget,
        gsm: p.gsm,
        fit: p.fit,
        careInstructions: "To be confirmed with production samples.",
        countryOfOrigin: "India",
        netQuantity: "1 N",
        detailsApproved: false,
        sizeGuideId: guide?.id,
        tags: p.tags,
        searchText,
        isFeatured: true,
        sortOrder: pi,
        isFixture: FIXTURES,
        seoTitle: `${p.name} — ${p.subtitle}`,
        seoDescription: `${p.name}, ${p.subtitle.toLowerCase()} from QOWL DROP 001. ${p.design}`,
      },
    });
    let sort = 0;
    for (const [ci, col] of p.colors.entries()) {
      const color = await db.productColor.create({ data: { productId: product.id, name: col.name, slug: col.slug, hex: col.hex, sortOrder: ci } });
      for (const img of col.images) {
        await db.productImage.create({ data: { productId: product.id, colorId: color.id, url: C(img.file), alt: img.alt, kind: img.kind, sortOrder: sort++, isConcept: true } });
      }
      for (const [si, size] of SIZES.entries()) {
        const sku = `${p.styleCode}-${col.slug.split("-").map((w) => w[0]!.toUpperCase()).join("")}${col.slug.length > 3 ? col.slug.slice(-1).toUpperCase() : ""}-${size}`;
        let onHand = 0;
        if (FIXTURES) {
          onHand = 15;
          if (p.slug === "origin" && col.slug === "black" && size === "XXL") onHand = 0; // out-of-stock fixture
          if (p.slug === "requiem" && col.slug === "forest-green" && size === "S") onHand = 1; // last-unit fixture
          if (p.slug === "ashen" && size === "S") onHand = 2; // low-stock fixture
        }
        const v = await db.productVariant.create({ data: { productId: product.id, colorId: color.id, size, sizeRank: si + 2, sku } });
        await db.inventoryLevel.create({ data: { variantId: v.id, onHand, lowStockThreshold: 3 } });
        if (onHand) await db.inventoryMovement.create({ data: { variantId: v.id, type: "RESTOCK", onHandDelta: onHand, onHandAfter: onHand, reason: "Development fixture stock" } });
      }
    }
  }
  if (FIXTURES) {
    const extra: Record<string, { file: string; alt: string; kind: "DETAIL" | "FABRIC" }[]> = {
      eclipse: [{ file: "eclipse-fleece-close", alt: "Close-up of brushed fleece on the Eclipse hoodie shoulder", kind: "FABRIC" }],
      origin: [{ file: "detail-embroidery", alt: "Close-up of the QOWL monogram embroidery", kind: "DETAIL" }],
      requiem: [{ file: "detail-garment-wash", alt: "Close-up of washed charcoal fabric texture", kind: "FABRIC" }],
    };
    for (const [slug, imgs] of Object.entries(extra)) {
      const prod = await db.product.findUniqueOrThrow({ where: { slug }, include: { images: true } });
      for (const img of imgs) if (!prod.images.some((i) => i.url === C(img.file))) await db.productImage.create({ data: { productId: prod.id, url: C(img.file), alt: img.alt, kind: img.kind, sortOrder: 50, isConcept: true } });
    }
  }
}

async function collections() {
  const all = await db.product.findMany({ orderBy: { sortOrder: "asc" } });
  const ids = (slugs: string[]) => all.filter((p) => slugs.includes(p.slug)).map((p) => p.id);
  const defs = [
    { slug: "drop-001", title: "Drop 001 / The Unwritten", eyebrow: "QOWL Collection", description: "A balanced blend of essentials, statements and experimentation.", heroImageUrl: C("tile-requiem"), imageAlt: "Requiem tee back artwork against cathedral arches", type: "MANUAL" as const, products: ids(["origin", "requiem", "phantom", "nocturne", "eclipse", "ashen"]), sortOrder: 0 },
    { slug: "oversized-t-shirts", title: "Oversized T-Shirts", eyebrow: "Category", description: "Dropped shoulders, relaxed bodies.", heroImageUrl: C("tile-origin"), imageAlt: "Model seated in the Origin tee", type: "RULE" as const, rules: { categorySlugs: ["t-shirts"] }, products: [], sortOrder: 1 },
    { slug: "heavyweight-hoodies", title: "Heavyweight Hoodies", eyebrow: "Category", description: "Pullover hoodies in heavyweight fleece.", heroImageUrl: C("tile-ashen"), imageAlt: "Model in the Ashen hoodie with the hood up", type: "RULE" as const, rules: { categorySlugs: ["hoodies"] }, products: [], sortOrder: 2 },
    { slug: "statement-graphics", title: "Statement Graphics", eyebrow: "Edit", description: "Original artwork pieces from Drop 001.", heroImageUrl: C("tile-eclipse"), imageAlt: "Eclipse hoodie back artwork", type: "MANUAL" as const, products: ids(["requiem", "eclipse", "phantom", "ashen"]), sortOrder: 3 },
    { slug: "the-essentials", title: "The Essentials", eyebrow: "Edit", description: "Quiet pieces to build on.", heroImageUrl: C("tile-phantom"), imageAlt: "Model in the Phantom tee", type: "MANUAL" as const, products: ids(["origin", "nocturne"]), sortOrder: 4 },
    { slug: "lookbook", title: "The Lookbook", eyebrow: "Editorial", description: "A visual exploration of Drop 001.", heroImageUrl: C("tile-lookbook"), imageAlt: "Model in a black hoodie against a gothic spire at dusk", type: "MANUAL" as const, linkType: "EDITORIAL" as const, editorialHref: "/lookbook", products: [], sortOrder: 5 },
  ];
  for (const d of defs) {
    if (await db.collection.findUnique({ where: { slug: d.slug } })) continue;
    await db.collection.create({
      data: {
        slug: d.slug, title: d.title, eyebrow: d.eyebrow, description: d.description, heroImageUrl: d.heroImageUrl, imageAlt: d.imageAlt,
        type: d.type, rules: "rules" in d ? (d.rules as Prisma.InputJsonValue) : undefined, linkType: "linkType" in d ? d.linkType : "PRODUCTS",
        editorialHref: "editorialHref" in d ? d.editorialHref : undefined, status: FIXTURES ? "ACTIVE" : "DRAFT", sortOrder: d.sortOrder,
        seoTitle: d.title, seoDescription: d.description,
        products: { create: d.products.map((productId, i) => ({ productId, sortOrder: i })) },
      },
    });
  }
}

async function fixtures() {
  const now = new Date();
  const settings: Record<string, Prisma.InputJsonValue> = {
    store: { brandName: "QOWL", establishedLine: "Est. 2026 — India", sellerState: "Maharashtra", supportEmail: "support@qowlstore.com", supportHours: "Mon–Sat, 10am–6pm IST (dev fixture)", tagline: "Wear Your Own Code.", description: "Independent streetwear for those who write their own code." },
    shipping: { flatRatePaise: 9900, freeShippingThresholdPaise: null, deliverAllIndia: true, serviceablePincodePrefixes: [], blockedPincodes: [], estimateMinDays: null, estimateMaxDays: null, dispatchNote: "Development fixture rate.", defaultWeightGrams: 400 },
    payments: { onlineEnabled: true, codEnabled: true, codMinOrderPaise: null, codMaxOrderPaise: 500000, codFeePaise: 0, codPincodePrefixes: [], codBlockedPincodes: [], codMaxOpenOrdersPerPhone: 2 },
    returns: { allowReturns: true, allowExchanges: true, windowDays: 7, requirePhotos: false, policySummary: "Development fixture policy: 7-day returns and exchanges on unworn items." },
    social: { instagram: "", youtube: "", pinterest: "", x: "", facebook: "" },
  };
  for (const [key, value] of Object.entries(settings)) await db.siteSetting.upsert({ where: { key }, create: { key, value }, update: {} });

  if (!(await db.announcement.count())) {
    await db.announcement.create({ data: { message: "DROP 001 — The Unwritten. Development preview.", href: "/collections/drop-001", isActive: true } });
  }
  if (!(await db.lookbookImage.count())) {
    const look = [
      { file: "lookbook-1", alt: "Model in a forest green QOWL hoodie beneath cathedral arches", product: "eclipse" },
      { file: "lookbook-2", alt: "Model in the Phantom tee in bone white", product: "phantom" },
      { file: "lookbook-3", alt: "Eclipse hoodie back artwork in forest green", product: "eclipse" },
      { file: "tile-lookbook", alt: "Model in a black hoodie against a gothic spire at dusk", product: null },
      { file: "campaign-duo", alt: "Two models in QOWL pieces in front of gothic arches", product: null },
      { file: "eclipse-standing", alt: "Full-length Eclipse hoodie styling", product: "eclipse" },
    ];
    for (const [i, l] of look.entries()) {
      const product = l.product ? await db.product.findUnique({ where: { slug: l.product } }) : null;
      await db.lookbookImage.create({ data: { imageUrl: C(l.file), alt: l.alt, productId: product?.id, isConcept: true, sortOrder: i, caption: i === 0 ? "Drop 001 — The Unwritten" : null } });
    }
  }
  const coupons = [
    { code: "WELCOME10", description: "DEV FIXTURE: 10% off a first order, max ₹300", type: "PERCENT" as const, value: 10, maxDiscount: 30000, firstOrderOnly: true },
    { code: "FLAT200", description: "DEV FIXTURE: ₹200 off orders of ₹1,999+", type: "FIXED" as const, value: 20000, minCartValue: 199900 },
  ];
  for (const c of coupons) await db.coupon.upsert({ where: { code: c.code }, create: { ...c, startsAt: now }, update: {} });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@qowl.test";
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? "QowlAdmin#2026dev";
  const superRole = await db.role.findUniqueOrThrow({ where: { key: "super_admin" } });
  await db.user.upsert({ where: { email: adminEmail }, create: { email: adminEmail, name: "Dev Admin", passwordHash: await hash(adminPass), emailVerifiedAt: now, roleId: superRole.id }, update: {} });
  const staff = [
    { email: "fulfillment@qowl.test", name: "Dev Fulfillment", role: "fulfillment_staff" },
    { email: "content@qowl.test", name: "Dev Content", role: "content_manager" },
    { email: "support@qowl.test", name: "Dev Support", role: "support_staff" },
  ];
  for (const s of staff) {
    const role = await db.role.findUniqueOrThrow({ where: { key: s.role } });
    await db.user.upsert({ where: { email: s.email }, create: { email: s.email, name: s.name, passwordHash: await hash("QowlStaff#2026dev"), emailVerifiedAt: now, roleId: role.id }, update: {} });
  }
  await db.user.upsert({ where: { email: "customer@qowl.test" }, create: { email: "customer@qowl.test", name: "Test Customer", passwordHash: await hash("QowlCustomer#2026"), emailVerifiedAt: now }, update: {} });
  console.log(`Fixtures loaded. Admin: ${adminEmail} / ${process.env.SEED_ADMIN_PASSWORD ? "(from env)" : adminPass}`);
}

async function main() {
  await base();
  await catalog();
  await collections();
  if (FIXTURES) await fixtures();
  console.log(`Seed complete (${FIXTURES ? "with development fixtures" : "base setup only"}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
