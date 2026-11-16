# QOWL — Search (SEO / GEO / AEO) implementation report

Production domain: **https://www.qowlstore.com** (apex `qowlstore.com` 308-redirects to `www`). Earlier sections were written against `qowlclothing.vercel.app`, which now redirects to the custom domain.
No custom domain is configured yet; when one is added, update `APP_URL` and everything
below (canonicals, sitemap, feed, JSON-LD) follows automatically.

Stack confirmed from the repository: Next.js 16 App Router (Turbopack), React 19 Server
Components, TypeScript, Prisma 7 + PostgreSQL (Neon), deployed on Vercel.

---

## A. Initial audit (15 Nov 2026)

Method: read the routing/metadata code, then fetched the **server-rendered HTML** of the live
site with a normal and a Googlebot user agent (`curl`, no JavaScript), checked status codes,
robots.txt, sitemap.xml, `<title>`, meta description, canonical, robots meta, `<h1>`, JSON-LD
and image `alt` attributes on representative pages.

What already worked well:
- Product, category, collection and home pages are **server-rendered**: names, prices, `<h1>`,
  descriptions and image `alt` text are in the initial HTML (no client-only content).
- Private routes (cart, checkout, account, orders, wishlist, auth, search, admin) carry
  `noindex`; robots.txt keeps crawlers out of `/admin`, `/account`, `/checkout`, `/cart`,
  `/api/`, `/orders/`, `/search`.
- Unknown categories and collections return a real **404**.
- Canonicals on products, categories and collections; BreadcrumbList JSON-LD on listings and
  product pages; a basic Product + AggregateOffer JSON-LD and Organization JSON-LD.
- Descriptive, non-stuffed image `alt` text on product imagery.

| # | Sev | Issue | Affected | Impact | Fix | Files | Verify |
|---|-----|-------|----------|--------|-----|-------|--------|
| 1 | **P0** | Unknown product URLs return **200** ("Product not found") — soft 404, also for Googlebot | `/products/*` | Dead/removed product URLs can be indexed as thin pages; wastes crawl budget | Call `notFound()` in `generateMetadata` so the 404 status is decided before streaming | `src/app/(store)/products/[slug]/page.tsx` | `curl -o /dev/null -w %{http_code}` → 404 |
| 2 | **P1** | Vercel **preview** deployments are indexable (robots logic keys on `NODE_ENV`, which is `production` on every Vercel build) | every `*-git-*.vercel.app` / `*-hash.vercel.app` URL | Duplicate copies of the store can be indexed and compete with production | Index only when `VERCEL_ENV=production` (or non-Vercel production); preview/staging get `Disallow: /` **and** `X-Robots-Tag: noindex` | `src/app/robots.ts`, `src/proxy.ts`, `src/lib/seo.ts` | robots.txt on a preview URL; response header |
| 3 | **P1** | Product structured data is a single `Product` + `AggregateOffer`: no variants, no per-variant SKU/size/colour/availability, no shipping or return policy | all PDPs | Not eligible for variant-aware merchant listings; Google can't map price/availability per size | `ProductGroup` + `hasVariant` (`Product` per colour×size with `Offer`, `sku`, `size`, `color`, `availability`, `shippingDetails`, `hasMerchantReturnPolicy`), `variesBy`, `productGroupID` | `src/lib/seo.ts`, PDP | Schema validation test + Rich Results Test |
| 4 | **P1** | Variant URLs can't preselect colour/size (needed for ProductGroup variant `url`) | PDP | Variant links in JSON-LD / feed would land on the wrong option | `?color=<slug>&size=<S>` preselects; canonical stays the clean product URL | PDP page, `product-view.tsx` | Open a variant URL |
| 5 | **P1** | No Google Merchant Center feed | — | Products can't be submitted to free listings / Shopping | Dynamic RSS 2.0 `g:` feed, one item per variant, from the live catalogue | `src/app/feeds/google-merchant.xml/route.ts` | XML validation test |
| 6 | P2 | Homepage has no canonical; `<h1>` is "The Unwritten" without the brand | `/` | Weaker branded relevance; duplicate-URL ambiguity (`/?utm=…`) | Canonical `/`; brand in the `<h1>` (visible eyebrow becomes part of it) | `src/app/(store)/page.tsx`, `hero.tsx` | HTML check |
| 7 | P2 | Organization JSON-LD lacks `@id`, contact point, return policy; no `WebSite` entity | `/` | Weaker brand-entity signals | `OnlineStore` (subtype of Organization) + `WebSite`, from Settings only (no invented facts) | `src/lib/seo.ts`, home | JSON-LD test |
| 8 | P2 | Sitemap: missing `/our-story`, `/contact`; static URLs without `lastModified`; includes "coming soon" pages (empty size guide / lookbook) | `/sitemap.xml` | Missed discovery; thin pages submitted | Add brand pages; drop empty pages; `lastModified` from data | `src/app/sitemap.ts` | sitemap test |
| 9 | P2 | Paginated listings canonicalise to page 1 | `?page=2…` | Products on later pages may be missed (minor today: 6 products) | Self-canonical for `page>1`; sort/filter params still canonicalise to the clean URL | listing routes | HTML check |
| 10 | P2 | Thin category descriptions ("Heavyweight pullover hoodies.") and no on-page category copy | `/category/*` | Weak relevance for non-branded category queries | Editable intro + body copy on categories and collections (CMS) | schema + admin + listing | Admin edit → HTML |
| 11 | P2 | Titles use em dashes and product titles don't say what the item is ("Eclipse — The Statement Hoodie — QOWL") | all | Lower CTR / clarity | `Eclipse Pullover Hoodie | QOWL`-style default built from name + garment type; admin override kept | PDP metadata | HTML check |
| 12 | P2 | Search Console / Bing verification not wired; no IndexNow | — | Can't verify ownership without code changes | `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` env → meta tags; IndexNow key route + ping on publish | layout, `src/lib/indexnow.ts` | HTML check |
| 13 | P2 | No explicit policy for AI crawlers | robots.txt | Unclear treatment of search vs training crawlers | Documented per-bot rules; retrieval bots allowed, training bots configurable | `src/app/robots.ts` | robots test |
| 14 | P3 | `?preview=1` product previews have no `noindex` | PDP preview | Low risk (staff only) | `noindex` when previewing | PDP | — |
| 15 | P3 | og:image on non-product pages is the square icon | listings | Weak social cards | Collection hero / first product image | listing metadata | — |
| 16 | Info | Product images are **concept renders** (labelled "Concept") | all PDPs | Merchant Center requires real product photos; concept images should not go to Shopping | Feed excludes products whose primary image is a concept render unless explicitly allowed | feed route | Feed test |
| 17 | Info | Size guide and fabric/GSM details are marked "provisional until samples are approved" | PDPs, `/size-guide` | Can't claim GSM/material in structured data until verified | Only emit `material` when the product's details are approved | `src/lib/seo.ts` | JSON-LD test |

---

## B. Changes implemented

| Area | Change | Files |
|---|---|---|
| Soft 404 (P0) | Missing products return a real **404** (removed the PDP `loading.tsx` that forced a streamed 200; the page resolves the product before anything else). Missing categories/collections also 404 from metadata. | `src/app/(store)/products/[slug]/page.tsx`, `…/category/[slug]/page.tsx`, `…/collections/[slug]/page.tsx` |
| Preview/staging (P1) | Indexable **only** on the production build serving the `APP_URL` host. Everything else: `robots.txt Disallow: /`, `X-Robots-Tag: noindex, nofollow`, `<meta robots noindex>`. Works even if Vercel system env vars are hidden. `ALLOW_INDEXING=false` switches production off too. | `src/lib/seo.ts` (`isIndexable`), `src/app/robots.ts`, `src/app/layout.tsx`, `next.config.ts` |
| Crawler policy | robots.txt: private/transactional paths disallowed for all; named AI **retrieval** bots (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, …) allowed on public pages; AI **training** tokens (GPTBot, Google-Extended, ClaudeBot, CCBot, …) blocked unless `AI_TRAINING_CRAWLERS=allow`. | `src/app/robots.ts` |
| Crawler HTML | `htmlLimitedBots` makes search/social crawlers receive fully resolved `<head>` metadata in the first HTML. | `next.config.ts` |
| Product JSON-LD (P1) | `ProductGroup` (`productGroupID` = style code, `variesBy` size/colour) with one `Product` + `Offer` per variant: real SKU, colour, size, per-variant price, stock-based availability, `NewCondition`, variant URL, colour-specific images, `shippingDetails` (from Settings), `hasMerchantReturnPolicy` (only when returns are switched on). `material` only once product details are approved; ratings only from approved reviews. | `src/lib/seo.ts` (`productLd`), PDP |
| Variant URLs | `?color=<slug>&size=<size>` preselects the option; canonical stays the clean product URL. | PDP, `src/components/product/product-view.tsx` |
| Brand entity | Homepage `@graph`: `OnlineStore` (Organization subtype: logo, description, social `sameAs`, customer-support `contactPoint`, return policy) + `WebSite`. Only Settings data. | `src/app/(store)/page.tsx`, `src/lib/seo.ts` |
| Titles & descriptions | Product titles say what the item is (`Eclipse Pullover Hoodie | QOWL`); the dev-seed `Name — Subtitle` value is treated as unset, real admin overrides still win. Descriptions trimmed on word boundaries. Titles use `|` instead of em dashes. | `src/lib/seo.ts`, PDP, `settings.ts` |
| Homepage | Canonical `/`; single `<h1>` now includes the brand ("QOWL / Drop 001 — The Unwritten") without changing the design. | `page.tsx`, `src/components/home/hero.tsx` |
| Canonicals | Sort/filter params canonicalise to the clean listing; `?page=N` (N>1) is self-canonical. Preview links are noindex. | `src/lib/seo.ts` (`listingCanonical`), listing routes |
| Thin pages | Size guide and lookbook are `noindex` while they show "coming soon". | `size-guide/page.tsx`, `lookbook/page.tsx` |
| Sitemap | Adds `/our-story`, `/contact`; real `lastModified` everywhere; **image sitemap** entries for products; categories only when they have products; drafts/empty pages excluded. | `src/app/sitemap.ts` |
| Redirects | `/about`, `/about-us` → `/our-story`; `/contact-us` → `/contact` (308). | `next.config.ts` |
| Merchant feed | `/feeds/google-merchant.xml`: RSS 2.0 + `g:` namespace, one item per colour×size from the live catalogue (id=SKU, item_group_id, title, description, variant link, images, availability, price/sale_price, brand, mpn, condition, age_group, colour, size, material*, product_type). Concept-image products are **excluded** by default. | `src/app/feeds/google-merchant.xml/route.ts` |
| Category/collection copy | New CMS field **Page content** (Markdown) on categories and collections, rendered under the grid with an `<h2>`. Empty = nothing rendered. | `prisma/schema.prisma` + migration `20261115120000_listing_content`, admin forms/actions, listing |
| Verification | `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` → meta tags. | `src/app/layout.tsx` |
| IndexNow | Optional (`INDEXNOW_KEY`): key at `/indexnow-key.txt`; product/collection publish, unpublish and edits ping IndexNow after the response (production only). | `src/lib/indexnow.ts`, `src/app/indexnow-key.txt/route.ts`, `src/server/actions/admin/catalog.ts` |
| llms.txt | **Experimental** `/llms.txt` brand-facts summary from live data (404 on non-production hosts). Not an official standard; no guarantee any assistant uses it. | `src/app/llms.txt/route.ts` |
| Performance | Hero is art-directed: optimised mobile + desktop srcsets, each **preloaded only for its own viewport** with `fetchpriority=high`; removed three below-the-fold product-card preloads that competed with the hero. | `src/components/home/hero.tsx`, `src/components/home/sections.tsx` |
| Tests | 11 new tests: indexing per host/env, titles, canonicals, ProductGroup required fields, no invented data, feed XML vs database stock/price. | `tests/unit/seo.test.ts`, `tests/integration/seo-feed.test.ts` |

## C. Technical SEO checklist (verified on a production build, `APP_URL=https://shop.qowl.example`)

| Check | Result |
|---|---|
| Home, product, category, collection, story pages return 200 with server-rendered `<h1>`, copy, prices | ✅ |
| Unknown product / category / collection → 404 (Googlebot and browser UA) | ✅ (product was 200 before) |
| `/about` → `/our-story` 308 | ✅ |
| Canonicals: product, variant URL, sorted listing, page 2, preview | ✅ |
| `robots` meta: indexable on production host; `noindex` on previews, private pages, preview links, empty pages | ✅ |
| `X-Robots-Tag: noindex` on non-production host; absent on production host | ✅ |
| robots.txt on production host vs preview host | ✅ |
| sitemap.xml valid XML, 26 URLs, 6 with images, real lastmod | ✅ |
| Merchant feed valid XML; per-variant fields; price/stock match DB (automated) | ✅ (0 items live until real photos) |
| JSON-LD parses; exactly one product entity per PDP; no duplicates | ✅ |
| Variant URL preselects size in the browser (`?color=forest-green&size=L` → L) | ✅ |
| Unit + integration tests 101/101, E2E 15/15 (checkout, payment, admin unaffected), tsc, eslint | ✅ |
| Google Rich Results Test / Schema Markup Validator | ⏳ **Not run** — they need a public URL with this code. Run after deploy (see I). |
| Search Console / Merchant Center diagnostics | ⏳ Need account access |

## D. Structured data

| Page | Types | Notes |
|---|---|---|
| Home | `OnlineStore` (+`ContactPoint`, `MerchantReturnPolicy` when set), `WebSite` | `@id`s link offers' `seller` to the store |
| Product | `ProductGroup` → `Product` × variants → `Offer` (+`OfferShippingDetails`, `MerchantReturnPolicy`), `BreadcrumbList` | Single-variant items use a plain `Product` |
| Category / collection | `BreadcrumbList` only | Listings are deliberately **not** marked up as products |

Deliberately omitted until real data exists: `gtin` (none exist), `aggregateRating`/`review` (no approved reviews), `deliveryTime` (no handling/transit times in Settings), `material` (until "details approved"), return fees, FAQ markup (no genuine FAQ content yet).

## E. Product / category SEO

- 6 product pages: descriptive titles, word-boundary meta descriptions, ProductGroup data, variant URLs, image sitemap.
- Categories (T-shirts, Hoodies) and collections: canonicals, pagination, and a new editable **Page content** block. **Copy still has to be written and approved** — suggested outline per category: who it's for → fit → fabric (only verified GSM/composition) → care → links to size guide and related category.
- Product descriptions and imagery are still development/concept content and should be replaced with approved copy and real photography before launch.

## F. GEO / AEO readiness

Done in code: clean server-rendered HTML; clear brand entity data; consistent facts across pages, JSON-LD, feed and `/llms.txt`; explicit crawler policy that lets AI *search/retrieval* bots read public pages while training crawlers are opt-in; `/our-story` and `/contact` as factual brand pages.

Cannot be guaranteed: whether Google AI Overviews/AI Mode, ChatGPT, Perplexity, Gemini or Claude mention or cite QOWL. `/llms.txt` is experimental. What moves the needle is original, verifiable content (fit, fabric, construction, care) and genuine third-party mentions.

## G. Performance (Lighthouse 12.6, mobile, simulated throttling)

| Page | Live before (`qowlclothing.vercel.app`, 15 Nov) | After |
|---|---|---|
| Home | Perf 88 · SEO 100 · LCP 2.7 s · CLS 0 · TBT 210 ms | **Not yet measured on Vercel.** Local `next start` numbers are not comparable (no CDN, cold image optimiser). |
| Product (Eclipse) | Perf 93 · SEO 100 · LCP 3.0 s · CLS 0 · TBT 150 ms | — |
| Hoodies | Perf 97 · SEO 100 · LCP 1.7 s · CLS 0 · TBT 170 ms | — |

LCP was the main photo on home and PDP with ~1.9 s *resource load delay*; the hero preload fix targets exactly that. Re-run Lighthouse/PageSpeed on the deployed site; real-user (p75) Core Web Vitals will appear in Search Console after enough traffic.

## H. Search integrations

| Integration | Status | Needs |
|---|---|---|
| Google Search Console | Prepared | Add property → HTML-tag method → put token in `GOOGLE_SITE_VERIFICATION` → redeploy → verify → submit `/sitemap.xml` |
| Bing Webmaster Tools | Prepared | Token in `BING_SITE_VERIFICATION` (or import from Search Console) → submit sitemap |
| IndexNow | Prepared | Generate a key → `INDEXNOW_KEY` → redeploy |
| Google Merchant Center | Feed ready (`/feeds/google-merchant.xml`) | Account, business info, India shipping & returns settings, **real product photos**, then add the feed as a scheduled fetch (daily) |
| Vercel Web Analytics | Live | — |
| GA4 e-commerce events | **Not implemented** | Measurement ID + a consent decision (DPDP Act). Planned events: `view_item_list`, `select_item`, `view_item`, `add_to_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` (once per order, keyed by order number), `refund`; no personal data in events |

## I. Remaining tasks

**Coding**
1. GA4 + consent banner (after Measurement ID / consent policy decision).
2. Journal (`/journal`) — CMS-backed articles with `Article` JSON-LD, author/reviewer and dates (only after real content exists).
3. Admin SEO helpers: snippet preview, length counters, duplicate-title and missing-alt warnings.
4. Category-specific og:images; `?page=N` beyond the last page → 404.

**After deploying this code**
1. Rich Results Test + Schema Markup Validator on `/products/eclipse` and `/`.
2. Lighthouse/PageSpeed on home and a PDP (compare with G).
3. Check `https://<preview-url>/robots.txt` shows `Disallow: /`.

**Merchant / Search accounts** — Search Console, Bing, Merchant Center setup (H). Do not expect free listings until Merchant Center approves products.

**Content approval (business)** — verified fabric composition and GSM per product, size charts (approve in Admin → Settings → Size guides), real product descriptions, category/collection page copy, policy pages, brand facts (founding story, manufacturing details) — no invented claims.

**Photography** — real front/back/detail/fabric/fit photos per colour; replace concept renders (required for Merchant Center).

**PR / outreach (manual)** — press kit (approved description, logo, product photos, founder/company info, media contact); list of independent fashion publications, campus creators and streetwear communities; transparent gifting. No paid links.

**Monitoring** — weekly: Search Console coverage/performance (split branded vs non-branded), Merchant Center diagnostics, Vercel analytics; monthly: Lighthouse, AI-visibility review below.

### AI-search visibility review (manual, monthly)

Ask the same questions on each platform you use (Google AI Mode/AI Overviews, ChatGPT search, Perplexity, Gemini, Copilot), logged in a sheet with: platform · date · exact question · location/account context · QOWL mentioned? · cited? · cited URL · accuracy · competitors mentioned. Sample questions: *Which Indian streetwear brands sell oversized T-shirts?* · *Where can I buy heavyweight graphic hoodies in India?* · *Independent Indian streetwear brands?* · *Gothic-inspired streetwear in India?* Answers vary by user and session — track trends, not "rankings". No scraping.

### Keyword map (hypothesis — **not** verified data)

No keyword tools or Search Console data were available, so there are no volumes, difficulty or CPC figures here. Validate with Keyword Planner / Search Console before committing.

| Intent | Example queries | Page |
|---|---|---|
| Category (commercial) | oversized t-shirts India, graphic oversized t-shirts, unisex oversized t-shirts | `/category/t-shirts` |
| Category (commercial) | heavyweight hoodies India, graphic hoodies, oversized hoodies | `/category/hoodies` |
| Collection / brand | QOWL drop 001, gothic streetwear India | `/collections/drop-001` |
| Product | "eclipse hoodie", "origin oversized tee" | product pages |
| Brand | QOWL, QOWL clothing | `/`, `/our-story` |
| Informational (future journal) | what does 240 GSM mean, oversized vs regular fit, how to wash printed hoodies | journal articles (to be written with verified facts) |

## J. 90-day roadmap

| Weeks | Focus |
|---|---|
| 1–2 | Merge & deploy; run Rich Results Test, Lighthouse; verify Search Console + Bing; submit sitemap; set INDEXNOW_KEY; confirm previews are noindex |
| 2–4 | Real product photography; approved fabric/GSM/fit per product; size charts; policy pages; write category + Drop 001 page copy; Merchant Center account + feed |
| 4–6 | Merchant Center diagnostics → fix; GA4 + consent; first two guides (oversized fit guide, care guide) from real production knowledge |
| 6–9 | Journal section in CMS; publish 2–4 reviewed articles; internal links from guides to categories/products; press kit; outreach list |
| 9–13 | Review Search Console queries (branded vs non-branded), refine titles/copy for pages with impressions but low CTR; first AI-visibility review; plan Drop 002 landing page and URL structure in advance |

## K. v2: qowlstore.com, share cards, FAQ (16 Nov 2026)

### What changed
- **Custom domain.** In production builds, any `*.vercel.app` host 308-redirects to `APP_URL` (path kept, `/api/*` excluded so webhooks and health checks still work). This only applies when `APP_URL` is set to a non-vercel.app domain.
- **Branded share images.** `opengraph-image` / `twitter-image` routes (1200×630 PNG) for the home page, every product (photo, name, type, price, MRP, sizes and colours), categories and collections (piece count, starting price, three product photos). Built with `next/og` from live data in `src/server/og.tsx`.
- **Expressive, data-driven metadata.**
  - Home: "QOWL | Indian Streetwear: Oversized T-shirts & Hoodies".
  - Products: price, size range and colour count go in front of the description.
  - Categories and collections: live facts, e.g. "3 pieces · from ₹1,899".
  - Our Story: rewritten description.
- **`/faq`.** Answers are generated from Settings and the catalogue (`src/lib/faq.ts`). A question is left out when its answer isn't configured, for example shipping rate, delivery estimate, return window or COD. The page carries FAQPage JSON-LD and is linked in the footer under Help and in the sitemap.
- **More structured data.**
  - ItemList on every product listing.
  - AboutPage on /our-story.
  - Organization now includes `slogan`, `email`, `areaServed` (India) and `knowsAbout`.
- **`/llms.txt`.** Now includes the tagline, a link to the FAQ and the full FAQ text.

Verified on a production build (`VERCEL_ENV=production APP_URL=https://www.qowlstore.com`):

| Check | Result |
|---|---|
| `qowlclothing.vercel.app/faq` | 308 to `https://www.qowlstore.com/faq` |
| `qowlclothing.vercel.app/api/health` | 200, not redirected |
| `www.qowlstore.com` pages | `index, follow`; canonical on www.qowlstore.com |
| Share-card routes | Return 200 `image/png` |

### Domain migration checklist (owner)
1. **Vercel → Settings → Environment Variables (Production):** set `APP_URL=https://www.qowlstore.com`, then redeploy. Until this is done, the live domain serves `noindex` with a vercel.app canonical.
2. **Google Cloud Console → OAuth client:**
   - Add the authorised redirect URI `https://www.qowlstore.com/api/auth/google/callback`.
   - Add the JavaScript origin `https://www.qowlstore.com`.
3. **Razorpay → Webhooks:** point the webhook to `https://www.qowlstore.com/api/webhooks/payments/razorpay`. The old vercel.app URL still works, because `/api` is not redirected.
4. **Google Search Console:**
   - Add a **Domain property** for `qowlstore.com`, verified with a DNS TXT record.
   - Submit `https://www.qowlstore.com/sitemap.xml`.
   - Request indexing for `/`, `/collections/drop-001` and `/faq`.
5. **Bing Webmaster Tools:** import the site from Search Console, then submit the sitemap.
6. **Google Merchant Center:**
   - Change the website to `https://www.qowlstore.com`, then re-claim it.
   - Set the feed URL to `https://www.qowlstore.com/feeds/google-merchant.xml`.
7. **IndexNow:** no change is needed. The key file is served on the new host automatically.
8. **Social profiles (Instagram bio and others):** update links to `qowlstore.com`.
