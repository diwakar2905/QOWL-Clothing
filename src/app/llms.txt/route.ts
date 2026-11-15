import { db } from "@/lib/db";
import { getSettings } from "@/server/services/settings";
import { visibleCollectionWhere, visibleProductWhere } from "@/server/services/catalog";
import { formatINR } from "@/lib/money";
import { absoluteUrl, BRAND, isIndexable, productTitle } from "@/lib/seo";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * EXPERIMENTAL: /llms.txt — a plain-text summary of verified brand facts and key
 * links for AI tools. It is not an official search standard and does not
 * guarantee that any assistant reads, uses or cites it. Built only from live
 * catalogue and Settings data.
 */
export async function GET() {
  if (!isIndexable((await headers()).get("host"))) return new Response("Not found", { status: 404 });
  const [s, products, collections, categories] = await Promise.all([
    getSettings(),
    db.product.findMany({ where: visibleProductWhere(), select: { name: true, slug: true, garmentType: true, seoTitle: true, subtitle: true, price: true, mrp: true }, orderBy: { sortOrder: "asc" } }),
    db.collection.findMany({ where: { ...visibleCollectionWhere(), linkType: "PRODUCTS" }, select: { title: true, slug: true, description: true } }),
    db.category.findMany({ where: { isActive: true }, select: { name: true, slug: true } }),
  ]);
  const st = s.store;
  const lines = [
    `# ${st.brandName || BRAND}`,
    "",
    `> ${st.description || "Independent Indian streetwear."}`,
    "",
    "## Facts",
    `- Website: ${absoluteUrl("/")}`,
    "- Market: India. Prices in INR (inclusive of GST).",
    ...(categories.length ? [`- Product categories: ${categories.map((c) => c.name).join(", ")}`] : []),
    ...(st.establishedLine ? [`- ${st.establishedLine}`] : []),
    ...(st.supportEmail ? [`- Customer care: ${st.supportEmail}${st.supportPhone ? `, ${st.supportPhone}` : ""}`] : []),
    "",
    "## Key pages",
    `- [Our story](${absoluteUrl("/our-story")})`,
    `- [Shop all](${absoluteUrl("/shop")})`,
    ...categories.map((c) => `- [${c.name}](${absoluteUrl(`/category/${c.slug}`)})`),
    ...collections.map((c) => `- [${c.title}](${absoluteUrl(`/collections/${c.slug}`)})${c.description ? `: ${c.description}` : ""}`),
    `- [Contact](${absoluteUrl("/contact")})`,
    "",
    "## Products",
    ...products.map((p) => `- [${productTitle(p)}](${absoluteUrl(`/products/${p.slug}`)}): ${formatINR(p.price)}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600" } });
}
