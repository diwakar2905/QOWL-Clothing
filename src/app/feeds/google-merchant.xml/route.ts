import { db } from "@/lib/db";
import { unitPrice } from "@/domain/pricing";
import { visibleProductWhere } from "@/server/services/catalog";
import { absoluteUrl, BRAND, productTitle, siteUrl, variantUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const money = (paise: number) => `${(paise / 100).toFixed(2)} INR`;
const plain = (md: string) => md.replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 5000);

/**
 * Google Merchant Center product feed (RSS 2.0 + g: namespace), one item per
 * colour × size, generated from the live catalogue so price and stock always
 * match the product page, structured data and checkout.
 *
 * Products whose main image is a concept render are left out by default:
 * Merchant Center requires photos of the actual product. Set
 * MERCHANT_FEED_INCLUDE_CONCEPT=true only for testing.
 */
export async function GET() {
  const includeConcept = process.env.MERCHANT_FEED_INCLUDE_CONCEPT === "true";
  const gender = process.env.MERCHANT_FEED_GENDER; // male | female | unisex — only if the business confirms it
  const now = new Date();
  const products = await db.product.findMany({
    where: visibleProductWhere(now),
    include: {
      category: true,
      colors: true,
      images: { orderBy: { sortOrder: "asc" } },
      variants: { where: { isActive: true }, include: { inventory: true }, orderBy: { sizeRank: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  });

  const items: string[] = [];
  let skippedConcept = 0;
  for (const p of products) {
    if (!p.images.length) continue;
    if (p.images[0]!.isConcept && !includeConcept) {
      skippedConcept++;
      continue;
    }
    const title = productTitle(p);
    for (const v of p.variants) {
      const color = p.colors.find((c) => c.id === v.colorId);
      const imgs = [...p.images.filter((i) => i.colorId === v.colorId), ...p.images.filter((i) => i.colorId !== v.colorId)];
      const available = (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) > 0;
      const price = unitPrice(p, v, now);
      const regular = Math.max(p.mrp, price);
      const fields: [string, string | null | undefined][] = [
        ["g:id", v.sku],
        ["g:item_group_id", p.styleCode],
        ["title", [title, color?.name, v.size].filter(Boolean).join(" - ")],
        ["description", plain(p.description)],
        ["link", variantUrl(p.slug, color?.slug, v.size)],
        ["g:image_link", absoluteUrl(imgs[0]!.url)],
        ...imgs.slice(1, 11).map((i) => ["g:additional_image_link", absoluteUrl(i.url)] as [string, string]),
        ["g:availability", available ? "in_stock" : "out_of_stock"],
        ["g:price", money(regular)],
        ["g:sale_price", price < regular ? money(price) : null],
        ["g:brand", BRAND],
        ["g:mpn", v.sku],
        ["g:condition", "new"],
        ["g:age_group", "adult"],
        ["g:gender", gender && ["male", "female", "unisex"].includes(gender) ? gender : null],
        ["g:color", color?.name],
        ["g:size", v.size],
        ["g:material", p.detailsApproved && p.fabric ? p.fabric.slice(0, 200) : null],
        ["g:product_type", `${p.category.name} > ${p.garmentType}`],
      ];
      items.push(
        `    <item>\n${fields
          .filter(([, val]) => val != null && val !== "")
          .map(([k, val]) => `      <${k}>${esc(String(val))}</${k}>`)
          .join("\n")}\n    </item>`,
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${BRAND} product feed</title>
    <link>${esc(siteUrl())}/</link>
    <description>${esc(`${BRAND} catalogue for Google Merchant Center. Generated ${now.toISOString()}.${skippedConcept ? ` ${skippedConcept} product(s) with concept images excluded.` : ""}`)}</description>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600", "X-Robots-Tag": "noindex" } });
}
