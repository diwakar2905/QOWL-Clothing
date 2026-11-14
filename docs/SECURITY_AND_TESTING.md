# Security & testing report

## Security controls (implemented)

| Area | Control | Where |
|---|---|---|
| Authentication | Argon2id (m=19 MiB, t=2, p=1); timing-equalised unknown-user path; identical error for wrong password vs unknown account; enumeration-safe sign-up and lockout (10 failures per email / 15 min); IP rate limits; sessions invalidated on password reset/change | `server/auth/password.ts`, `server/services/auth.ts` |
| Sessions | 256-bit random tokens, only SHA-256 hashes stored; HttpOnly, SameSite=Lax, Secure + `__Host-` prefix in production; 12 h staff / 30 d customer expiry; "sign out everywhere" | `server/auth/session.ts` |
| Authorisation | 24 granular permissions, DB roles; `requirePermission` at the top of every admin page, Server Action and admin API route (no reliance on hidden buttons); staff can't change their own role; Super Admin role locked | `server/auth/permissions.ts`, `server/actions/admin/*` |
| IDOR/BOLA | Bag items scoped to the caller's bag; orders visible only to the owner or holder of an unguessable access token (hash stored); return requests require owner account; public tracking returns status only after order number **and** email match | `services/cart.ts`, `services/orders.ts`, `actions/orders.ts` |
| CSRF | Origin check + JSON content-type for all mutating `/api/*`; Next.js origin check for Server Actions; SameSite cookies | `src/proxy.ts` |
| Input validation | Zod on every API/action input; Indian mobile/PIN/state validation; integer-paise money; CHECK constraints in Postgres | `lib/validation.ts`, migrations |
| Injection | Prisma parameterised queries; tagged-template raw SQL only; LIKE wildcards escaped in search | services |
| XSS | React escaping everywhere; CMS pages via restricted Markdown → React (no raw HTML); JSON-LD serialised with `<`/`>`/`&` escaped; emails HTML-escaped; CMS/hero/announcement links restricted to site paths or https | `components/ui/markdown.tsx`, `lib/utils.ts` |
| Open redirects | `safeInternalPath` for `next=` parameters | `lib/utils.ts` |
| Payments | Server-created gateway orders; checkout HMAC signature verification **and** server fetch of payment; webhook HMAC over raw body with constant-time compare; `(provider,eventId)` dedupe; row-locked idempotent finalisation; amount-mismatch → on hold; refunds idempotent per key, counted only when processed; card data never touches our servers (Razorpay hosted checkout) | `server/payments/*`, `services/payments.ts`, `services/refunds.ts` |
| Pricing integrity | Server recomputes every price, discount, tax and total; client totals only used to *detect* changes (409 `TOTAL_CHANGED`) | `services/cart.ts`, `services/checkout.ts` |
| Inventory | Atomic conditional updates; CHECK constraints (non-negative, reserved ≤ on hand); deadlock-safe ordering | `services/inventory.ts` |
| Uploads | Size limit, decode with sharp (rejects non-images/polyglots, pixel limit), re-encode to WebP (strips EXIF/GPS), random keys, path-traversal-safe local serving, `nosniff` | `server/storage/index.ts` |
| SSRF | No user-supplied URLs are fetched server-side; outbound calls only to fixed provider hosts | — |
| Headers | CSP (scripts self + Razorpay), HSTS (prod), X-Frame-Options DENY, frame-ancestors none, nosniff, Referrer-Policy, Permissions-Policy, COOP; admin/account `no-store`, admin `noindex` | `next.config.ts` |
| Secrets | Zod-validated env; refuses mock providers, dev secrets and Razorpay test keys in production; logger redacts secret-like keys | `lib/env.ts`, `lib/logger.ts` |
| Abuse | DB-backed rate limits on login, register, reset, newsletter, coupon, search, PIN check, tracking, checkout, payment verify; COD open-order cap per phone | `services/rate-limit.ts` |
| Audit | Price/stock/status/refund/settings/staff/role/export changes logged with actor & IP | `services/audit.ts`, Admin → Audit log |
| Privacy | Contact data masked for roles without `customers.pii`; search analytics store query text only; recently-viewed kept on device; consent text + timestamp recorded for marketing; account deletion request → admin anonymisation | various |
| Spreadsheet export | CSV formula-injection neutralised | `toCsv` |

### Known limitations / recommendations
- CSP allows `'unsafe-inline'` scripts (Next.js bootstrap without per-request nonces). Moving to nonce-based CSP would force fully dynamic rendering; reconsider if third-party scripts are added.
- No 2FA for staff yet — recommended before launch (TOTP) or put `/admin` behind an identity-aware proxy.
- Malware scanning of uploads is not performed (images are re-encoded, which neutralises embedded payloads).
- `npm audit`: **0 vulnerabilities in production dependencies**; 1 moderate advisory (minimatch ReDoS) in dev-only ESLint tooling.

## Automated tests

| Suite | Count | Scope |
|---|---|---|
| Unit (`tests/unit`) | 42 | GST extraction & slabs, discount allocation, sale windows, shipping/COD totals, coupon rules (incl. bag-stage identity deferral), order/fulfilment/return state machines, return windows & refund maths, money formatting/allocation, URL safety, Indian validation, password policy, CSV & email escaping, Razorpay checkout/webhook signatures, RBAC least-privilege, CMS/listing input sanitising |
| Integration (`tests/integration`, real Postgres) | 30 | Guest checkout → verified payment → stock commit → bag cleared → email queued; forged signature rejected; idempotent checkout; total-changed guard; payment failure → retry hold → idempotent expiry; late capture after stock sold → on hold; duplicate webhook processed once; unsigned webhook rejected; 5 concurrent reservations for 1 unit → exactly 1 succeeds; DB rejects negative stock; out-of-stock add blocked; coupon applied + first-order enforced at checkout; COD commit + COD disabled; cancel paid order → stock restored → idempotent gateway refund → over-refund blocked; ship → deliver → return → quarantine → inspect/restock → refund; stock adjustments can't go negative; guest order IDOR blocked; server-side role enforcement; enumeration-safe login errors; amount-mismatch releases stock; refund timeout stays pending and reconciles without double refund; forged return-photo URLs rejected; email order links grant guest access; identical register/lockout responses for existing vs unknown emails; email confirmation signs in once; unpaid-order replacement vs paid-meanwhile detection |
| E2E (`e2e`, Playwright, desktop + Pixel 7) | 15 | The 18 required flows (several combined): guest checkout & refresh-safe confirmation (1/7/18), registered checkout (2), colour/size + direct PDP load (3/17), out-of-stock (4), concurrent last unit (5), payment failure + retry (6), failure → switch to COD (6b), duplicate webhook (8), return request + admin inspect & refund (9/10), admin add product (11), admin restock (12), admin homepage update (13), coupon (14), unauthorized admin/API access (15), mobile nav/search/checkout (16) |

Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`.

### Issues found and fixed during testing
- Cart drawer stayed open across navigation (blocked checkout UI).
- Nested `<form>` in checkout (hydration error).
- Guests couldn't apply first-order coupons in the bag (identity rules now provisional until checkout).
- Mobile horizontal overflow on product pages (implicit grid column sizing) displaced the sticky purchase bar.
- Server components passed closures to client buttons (runtime error on 3 admin pages).
- Conditional hook calls and effect-driven state cascades flagged by React lint.
- Partial-commit edge case: cancellation/hold-release now derive committed quantities from the inventory ledger.
- Late payment on a cancelled order now records the capture and flags a refund instead of failing webhook retries forever.
- Admin login action could have serialised the user record if a redirect didn't fire.

### Issues found in the full-codebase review (fixed)
- **Missing file in the repository:** the `storage/` ignore rule also matched `src/server/storage/`, so the media module was never committed (fresh clones and CI would fail). Consolidated at `src/server/storage.ts`; ignore rule narrowed to `/storage/`.
- **Fresh installs couldn't generate the Prisma client** without `DATABASE_URL` (also broke the Docker build stage).
- **Stock leak:** an amount-mismatched payment put the order on hold but left its stock reservation active forever; the expiry job now also clears stale holds on non-pending orders.
- **Check ordering** in payment finalisation could flip a confirmed order to On Hold or throw on a cancelled order (endless webhook retries).
- **Possible double refund:** a refund API timeout was marked FAILED even if Razorpay processed it. Unknown outcomes now stay PENDING (amount stays reserved) and a job reconciles them via the provider's refund list; refund webhooks are matched by our own reference too.
- **Reconciliation starvation:** >50 abandoned checkouts could stop newer orders from being reconciled (now newest-first).
- **Guest order emails linked to the account area** (unusable by guests) and repeat submits rotated the access token. Tokens are now derived per order (HMAC), so every email carries a working link.
- **Return photos accepted arbitrary URLs** that were then rendered in the admin (e.g. tracking pixels). Now limited to the customer's own validated uploads.
- **A helper exported from a `"use server"` module** was publicly callable without a permission check.
- **CMS image URLs** weren't validated; a pasted external URL could crash pages at render. Now restricted to uploads, site paths or the media CDN.
- `/api/payments/failed` (which calls the gateway) wasn't rate-limited.

### Follow-up fixes
- **Registration is enumeration-safe:** new and existing emails get the same response; new accounts are activated (and signed in) from the verification email via a button press (so link-prefetching mail scanners can't consume the token); existing owners receive an "account already exists" email.
- **Lockout is enumeration-safe:** failed sign-ins are counted per email address in the rate-limit store whether or not an account exists, with one identical 429 message; a password reset clears the counter.
- **Changing details after a failed payment:** if the shopper switches to COD or edits contact/address, the server first confirms with the gateway that the old order is unpaid, releases it (stock and coupon), and a fresh order is placed; if it was actually paid, the shopper is taken to its confirmation instead.

### Not verified (requires external accounts)
Razorpay sandbox/live, Shiprocket API, Resend delivery, S3 uploads. Manual accessibility audit with screen readers and Core Web Vitals field measurement on a deployed environment are also outstanding (see report).
