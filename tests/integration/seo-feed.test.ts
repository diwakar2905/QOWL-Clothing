import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { GET as feed } from "@/app/feeds/google-merchant.xml/route";

afterEach(() => { delete process.env.MERCHANT_FEED_INCLUDE_CONCEPT; });

const items = (xml: string) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => Object.fromEntries([...m[1]!.matchAll(/<([\w:]+)>([^<]*)<\/\1>/g)].map((x) => [x[1], x[2]])));

describe("Google Merchant Center feed", () => {
  it("leaves out products that only have concept images", async () => {
    const res = await feed();
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    const concept = await db.product.count({ where: { status: "ACTIVE", images: { some: { sortOrder: 0, isConcept: true } } } });
    if (concept) expect(xml).toContain("concept images excluded");
  });

  it("lists every active variant with price and stock matching the catalogue", async () => {
    process.env.MERCHANT_FEED_INCLUDE_CONCEPT = "true";
    const xml = await (await feed()).text();
    const list = items(xml);
    const variants = await db.productVariant.findMany({ where: { isActive: true, product: { status: "ACTIVE", publishAt: null } }, include: { inventory: true, product: true } });
    expect(list.length).toBe(variants.filter((v) => v.product.publishAt == null).length);
    for (const it of list) {
      for (const k of ["g:id", "g:item_group_id", "title", "description", "link", "g:image_link", "g:availability", "g:price", "g:brand", "g:condition", "g:size"]) expect(it[k], `${it["g:id"]} ${k}`).toBeTruthy();
      expect(it["g:price"]).toMatch(/^\d+\.\d{2} INR$/);
      const v = variants.find((x) => x.sku === it["g:id"])!;
      expect(v).toBeTruthy();
      const available = (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0) > 0;
      expect(it["g:availability"]).toBe(available ? "in_stock" : "out_of_stock");
      expect(it["g:item_group_id"]).toBe(v.product.styleCode);
      expect(it.link).toContain(`/products/${v.product.slug}?`);
    }
  });
});
