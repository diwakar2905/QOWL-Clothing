import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isIndexable, siteUrl } from "@/lib/seo";

/** Never crawled: private, transactional or duplicate (internal search) URLs. */
const PRIVATE = ["/admin", "/account", "/checkout", "/cart", "/wishlist", "/api/", "/orders/", "/search", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/newsletter/", "/*?*preview=1"];

/**
 * AI crawlers that fetch pages to answer or cite a user's live question
 * (they behave like search). Allowed on public pages, same exclusions as above.
 */
const AI_RETRIEVAL = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User", "DuckAssistBot", "MistralAI-User"];

/**
 * Crawlers / product tokens used to collect model-training data. Not needed for
 * search visibility. Blocked unless AI_TRAINING_CRAWLERS=allow. Google-Extended
 * and Applebot-Extended only control training use; they don't affect Google
 * Search or Apple search indexing.
 */
const AI_TRAINING = ["GPTBot", "Google-Extended", "Applebot-Extended", "ClaudeBot", "anthropic-ai", "CCBot", "Meta-ExternalAgent", "Bytespider", "cohere-training-data-crawler", "Amazonbot"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  const base = siteUrl();
  if (!isIndexable(host)) {
    // Previews, staging, localhost: keep everything out of search engines.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const trainingAllowed = process.env.AI_TRAINING_CRAWLERS === "allow";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_RETRIEVAL, allow: "/", disallow: PRIVATE },
      trainingAllowed ? { userAgent: AI_TRAINING, allow: "/", disallow: PRIVATE } : { userAgent: AI_TRAINING, disallow: "/" },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
