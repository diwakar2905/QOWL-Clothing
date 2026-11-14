# Implementation status report

Legend: **Implemented** · **Tested** (automated) · **Config** = requires credentials/business configuration · **Blocked** · **Not implemented**

| Module | Status | Notes |
|---|---|---|
| Design system & brand assets | Implemented | Forest/ivory tokens, Cormorant Garamond + Inter (self-hosted), supplied logo recoloured on transparency (artwork unaltered). Visual QA via screenshots at 1440px and 390–412px. |
| Homepage (CMS-driven) | Implemented · Tested (E2E hero edit) | Announcement bar, hero (multi-slide, pause, reduced-motion), marquee, The First Six, campaign, category tiles, craft (approved claims only), lookbook, newsletter, footer. |
| Collections / listings / search | Implemented · Tested | Shareable filter URLs, mobile filter drawer, sort (popularity only when real sales exist), pagination, typo-tolerant search with suggestions. |
| Product detail | Implemented · Tested | Colour-aware gallery, zoom, swipe, size guide (approved only), stock-aware sizes, quantity, add/buy now, wishlist, PIN checker, disclosures, JSON-LD, recommendations, recently viewed (device-local). |
| Accounts & auth | Implemented · Tested | Register, verify email, login, lockout, reset, profile, addresses, order history, wishlist, preferences, deletion request. Google sign-in **not implemented** (optional). |
| Cart | Implemented · Tested | Guest + account, merge on login, server pricing, change detection, coupons. |
| Checkout | Implemented · Tested | Indian address validation, saved addresses, COD rules, idempotency, total-change guard, terms consent. |
| Payments (Razorpay) | Implemented · **Config** | Orders API, signature + server fetch, webhooks, reconciliation, refunds. Verified via mock gateway with identical semantics and unit-tested signature algorithms; **sandbox not yet exercised (no keys)**. |
| Orders & statuses | Implemented · Tested | Separate order/payment/fulfilment/return/refund statuses, state machines, history, notes, cancellation, on-hold handling, GST invoice. |
| Inventory | Implemented · Tested | Per-variant on hand/reserved/committed/damaged/returned, reservations with TTL, ledger, CSV import/export, low-stock alerts, concurrency-safe. |
| Shipping & fulfilment | Implemented · Tested (manual/mock) · **Config** (Shiprocket) | Manual fulfilment fully working; Shiprocket adapter (serviceability, AWB, label, cancel, tracking, webhook) **not verified against the live API**. |
| Returns / exchanges / refunds | Implemented · Tested | Request with photos, approve/reject, pickup, quarantine, inspection-driven restock, refund, exchange shipment. |
| Admin dashboard | Implemented · Tested (crawl + E2E) | Overview (real metrics + launch readiness), products, variants, images, collections, categories, inventory, orders, returns, customers, discounts, CMS, reviews, newsletter, settings, tax classes, size guides, email templates, staff & roles, audit log. |
| Notifications | Implemented · **Config** | All required transactional emails via outbox with retries; Resend provider. SMS/WhatsApp **not implemented** (interface only). |
| Reviews | Implemented | Verified-purchase only, moderation, reporting; displayed only when approved. |
| Newsletter | Implemented · Tested (unit) | Consent recording, double opt-in, unsubscribe, rate limits, audited CSV export. |
| SEO | Implemented | Metadata, canonical URLs, sitemap, robots (indexing only in production), Product/Breadcrumb/Organization JSON-LD, OG. |
| Security | Implemented · Tested | See SECURITY_AND_TESTING.md. Staff 2FA **not implemented** (recommended). |
| Accessibility | Implemented (partial verification) | Semantic landmarks, skip link, labelled controls, native `<dialog>` focus handling, live regions, reduced motion, 44px targets. **Manual screen-reader audit outstanding.** |
| Performance | Implemented (partial verification) | next/image (AVIF/WebP, sizes), priority LCP images, self-hosted fonts, no layout-shifting images. **Lighthouse/CWV field measurement outstanding** (needs deployed environment). |
| Deployment readiness | Implemented | Dockerfile, CI workflow, env validation, health check, job endpoint, backup/monitoring guidance. Not deployed (no hosting credentials). |
| Live payments / deployment | **Blocked** | Requires the business's credentials and explicit authorisation. |

See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for every pending credential and business decision.
