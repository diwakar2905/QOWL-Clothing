# API reference

All JSON endpoints return `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code", "message", "fields?", "details?" } }` with an appropriate HTTP status (400 validation/bad input, 401 unauthenticated, 403 forbidden/CSRF, 404, 409 business conflict such as `OUT_OF_STOCK`/`TOTAL_CHANGED`, 413, 422 validation, 429 rate-limited, 5xx). Responses are `Cache-Control: no-store`.

**CSRF:** state-changing `/api/*` requests must send `Origin` matching the host and `Content-Type: application/json` (enforced in `src/proxy.ts`). Webhooks, cron and health are exempt and authenticate by signature/secret. Server Actions use Next.js' built-in origin check.

**Auth:** cookie session (`qowl_session`, `__Host-qowl_session` in production). Guest bag cookie: `qowl_cart`.

## Storefront

| Method & path | Body / query | Notes |
|---|---|---|
| `GET /api/cart` | — | Bag with server-computed pricing, per-line issues (`UNAVAILABLE`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `PRICE_CHANGED`) and checkout blockers. |
| `POST /api/cart/items` | `{ variantId, quantity }` | Validates visibility and stock; max 10 per line. |
| `PATCH /api/cart/items/:id` | `{ quantity }` | 0 removes. Scoped to the caller's bag. |
| `DELETE /api/cart/items/:id` | — | |
| `POST /api/cart/coupon` | `{ code }` | Server-validated; rate-limited. `DELETE` removes. |
| `POST /api/cart/reconcile` | `{}` | Accept current prices/availability. |
| `GET /api/wishlist` · `POST /api/wishlist` | `{ productId, on? }` | Signed-in customers. `POST /api/wishlist/merge` `{ productIds }` merges a guest list. |
| `GET /api/products/:slug` | — | Quick-view payload (public fields only). |
| `GET /api/products/cards?ids=a,b` | — | Public product cards (≤30). |
| `GET /api/search?q=` | — | Suggestions with typo tolerance; "did you mean". |
| `GET /api/delivery?pincode=` | — | Serviceability, COD availability, estimate (only if configured/provider-supplied). |
| `POST /api/newsletter` | `{ email, consent: true, source? }` | Double opt-in by default; never reveals existing subscriptions. |
| `POST /api/checkout` | `{ idempotencyKey (uuid), email, phone, address{fullName,phone,line1,line2?,landmark?,city,state,pincode,country:"IN"}, paymentMethod: "ONLINE"\|"COD", acceptTerms: true, marketingOptIn?, saveAddress?, customerNote?, expectedTotal (paise) }` | Creates the order (or returns the existing one for the same key). Returns `{ orderNumber, accessToken, payment: { provider, keyId, providerOrderId, amount, currency, prefill } \| null }`. `409 TOTAL_CHANGED` if the server total differs from what was shown. |
| `POST /api/checkout/retry` | `{ orderNumber, token? }` | New payment attempt while the stock hold is active. |
| `POST /api/checkout/replace` | `{ orderNumber, token? }` | Shopper changed details/method after a failed payment: confirms with the gateway, then releases the unpaid order. Returns `{ status: "released" \| "paid" }`. |
| `POST /api/payments/verify` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | HMAC verification + server-side payment fetch. Returns `{ status: paid\|on_hold\|failed\|pending }`. |
| `POST /api/payments/failed` | `{ providerOrderId }` | Browser hint; server reconciles with the gateway. |
| `GET /api/orders/:number/status?t=` | — | Owner or access token; reconciles pending payments. |
| `POST /api/payments/mock/simulate` | `{ providerOrderId, outcome }` | **Development only** (404 otherwise). |

## Webhooks, jobs, health

| Path | Auth | Purpose |
|---|---|---|
| `POST /api/webhooks/payments/razorpay` | `X-Razorpay-Signature` = HMAC-SHA256(raw body, webhook secret) | payment.captured/authorized/failed, order.paid, refund.processed/failed. Deduplicated by `x-razorpay-event-id`; 2xx on success/duplicate, non-2xx → gateway retries. |
| `POST /api/webhooks/shipping/shiprocket` | `x-api-key` = `SHIPROCKET_WEBHOOK_TOKEN` | Tracking events (deduplicated per scan). |
| `POST /api/cron/jobs` | `Authorization: Bearer CRON_SECRET` | Reconcile payments → expire holds → send emails → sync tracking → cleanup. |
| `GET /api/health` | — | DB connectivity. |

## Admin (permission-checked)

| Path | Permission |
|---|---|
| `GET /api/admin/inventory/export` | `inventory.read` |
| `GET /api/admin/newsletter/export` | `newsletter.export` (audited) |
| `GET /orders/:number/invoice` | owner/token, or `orders.read` |

All other admin operations are Server Actions in `src/server/actions/admin/*`, each beginning with `requirePermission(...)` and writing to the audit log for sensitive changes (catalogue: `catalog.ts`; stock/orders/fulfilment/refunds/returns/customers/discounts/reviews: `operations.ts`; CMS/settings/tax/templates/size guides/staff/roles: `content.ts`).
