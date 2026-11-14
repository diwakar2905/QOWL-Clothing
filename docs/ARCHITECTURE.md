# Architecture

## Shape: a modular monolith

```
src/
  app/                 Next.js routes
    (store)/           storefront pages (shared header/footer layout)
    admin/(auth|panel) staff sign-in + permission-gated dashboard
    api/               JSON API (cart, checkout, payments, webhooks, cron, exports)
    orders/[n]/invoice printable GST invoice
  domain/              PURE business rules (no I/O): pricing & GST, coupons, state machines, returns
  server/
    services/          business logic + persistence (cart, checkout, orders, inventory, payments,
                       refunds, fulfillment, returns, catalog, settings, newsletter, analytics…)
    payments/          gateway interface + Razorpay + mock adapters
    shipping/          provider interface + manual rules, Shiprocket, mock
    notifications/     templates, providers, transactional outbox
    auth/              sessions, password hashing, permissions
    actions/           Server Actions (forms) — thin, validate + authorise + call services
    cms/               homepage section schemas & resolution
    storage/           media upload validation & drivers
    jobs/              periodic job runner
  components/          UI (storefront, admin, ui primitives)
  lib/                 env validation, db client, logger, money, crypto, validation schemas
prisma/                schema, migrations, seed
```

UI components never contain business rules; they call the API or Server Actions, which call services, which call the domain layer and Prisma.

## Key decisions

| Decision | Rationale |
|---|---|
| **Modular monolith on Next.js** | One deployable, one database, low operational overhead for a small brand; module boundaries keep a later split possible. |
| **Money as integer paise; prices GST-inclusive** | No float errors; matches Indian MRP convention. Tax is *extracted* per line (`domain/pricing.ts`) with slab support (e.g. 5% ≤ ₹2,500/piece, 18% above — configurable, review required). |
| **Immutable order snapshots** | `Order`/`OrderItem` store names, SKUs, HSN, unit prices, discounts and tax per line; editing products never changes history or invoices. |
| **Separate status axes** | `Order.status`, `paymentStatus`, `fulfillmentStatus`, plus `ReturnRequest.status` and `Refund.status`; every change is validated by `domain/state-machines.ts` and appended to `OrderStatusHistory`. |
| **Inventory: onHand / reserved / committed / damaged / returnedPending** | Checkout reserves with a single conditional `UPDATE … WHERE onHand - reserved >= qty`, in sorted variant order (no deadlocks). Payment converts reservations to committed; shipping removes committed; returns sit in quarantine until inspection. DB `CHECK` constraints make negative stock impossible. Per-order committed quantities are derived from the movement ledger, so partial commits/cancellations stay exact. |
| **Reservation TTL + idempotent expiry job** | Unpaid checkouts hold stock for `RESERVATION_TTL_MINUTES` (default 30). Late payments re-take stock if available, otherwise the order goes **On hold** for refund/restock — captured money is never lost. |
| **Payment truth from the gateway** | The browser callback is only a hint: the server verifies the HMAC signature *and* fetches the payment from the gateway. Webhooks are signature-verified, deduplicated by `(provider, eventId)`, and processing is idempotent under a row lock. A reconciliation job catches anything missed. |
| **Custom session auth** | Argon2id (OWASP params), opaque random tokens stored only as SHA-256 hashes, HttpOnly + SameSite=Lax (+ `__Host-` & Secure in production) cookies, 30-day customer / 12-hour staff sessions, account lockout and DB-backed rate limits. Follows the Lucia/Copenhagen Book guidance; avoids a third-party auth dependency for a security-critical path. |
| **DB-backed RBAC** | 24 granular permissions; 5 system roles editable by Super Admin. Every admin page and action calls `requirePermission` on the server. |
| **Transactional outbox** | Emails are written in the same transaction as the business change (dedupe keys prevent duplicates), flushed after the response and by the job runner with exponential backoff. |
| **Postgres search** | Denormalised `searchText` + `pg_trgm` GIN index (substring + word similarity) gives typo tolerance without extra infrastructure. |
| **Request-time rendering** | Catalogue pages render per request so stock and prices are always fresh and builds don't need a database. Add caching (e.g. `revalidatePath` on admin edits) if traffic requires. |
| **Restricted Markdown for CMS pages** | Rendered to React elements; raw HTML is never emitted, so stored content can't inject scripts. |

## Request flow: online checkout

1. `POST /api/checkout` (idempotency key from the browser, tied to the bag's contents) → validates the bag, address, delivery, COD rules and the exact total the shopper saw.
2. One DB transaction: order number, order + item snapshots, coupon re-validated under a row lock, stock reserved.
3. Gateway order created (outside the transaction) → `Payment(CREATED)`.
4. Razorpay Checkout opens in the browser → `POST /api/payments/verify` (signature + server fetch) → `finalizePaidOrder` (row-locked, idempotent): commit stock, confirm order, commit coupon, clear bag, queue email.
5. Webhook `payment.captured` arrives later → deduplicated → same idempotent finalisation (no-op).
