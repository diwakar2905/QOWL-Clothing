import "server-only";
import { after } from "next/server";
import { absoluteUrl, isIndexable, siteUrl } from "@/lib/seo";
import { logger } from "@/lib/logger";

/**
 * IndexNow (Bing, Yandex, Seznam, Naver…): tell participating engines that a
 * public URL was added, changed or removed. Optional — needs INDEXNOW_KEY (8–128
 * chars, a-z A-Z 0-9 -), served at /indexnow-key.txt for ownership checks.
 * Only runs on the indexable production deployment. It complements, and never
 * replaces, the sitemap. Google does not use IndexNow.
 */
export function indexNowKey(): string | null {
  const k = process.env.INDEXNOW_KEY?.trim();
  return k && /^[A-Za-z0-9-]{8,128}$/.test(k) ? k : null;
}

export function pingIndexNow(paths: string[]) {
  const key = indexNowKey();
  if (!key || !paths.length || !isIndexable()) return;
  const urlList = [...new Set(paths.map((p) => absoluteUrl(p)))];
  after(async () => {
    try {
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: new URL(siteUrl()).host, key, keyLocation: `${siteUrl()}/indexnow-key.txt`, urlList }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok && res.status !== 202) logger.warn("indexnow.rejected", { status: res.status, count: urlList.length });
    } catch (e) {
      logger.warn("indexnow.failed", { e });
    }
  });
}
