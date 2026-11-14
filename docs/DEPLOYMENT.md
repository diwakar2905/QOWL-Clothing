# Production deployment

> Do not take real payments until every item in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) is complete and Razorpay live keys have been tested with a small real transaction by the business.

## Recommended topology
- **App**: any Node 22 host that runs a long-lived Next.js server (Vercel, Render, Railway, Fly.io, AWS App Runner/ECS) or the provided `Dockerfile`. Region: Mumbai (ap-south-1) close to customers and the database.
- **Database**: managed PostgreSQL 16 (Neon, Supabase, RDS, Cloud SQL) with automated daily backups + point-in-time recovery, TLS required. Use a pooled connection string if the host scales to many instances.
- **Media**: S3-compatible bucket (S3, Cloudflare R2) behind a CDN; set `STORAGE_DRIVER=s3` and `MEDIA_PUBLIC_BASE_URL`.
- **Scheduler**: call `POST /api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` every **2–5 minutes** (Vercel Cron, GitHub Actions schedule, cloud scheduler, or `npm run jobs:run` from cron). It reconciles payments, expires unpaid reservations, sends queued emails, polls tracking and cleans up.

## Release steps
1. Set environment variables from `.env.example` (production values; `NODE_ENV=production`, `PAYMENT_PROVIDER=razorpay`, `SHIPPING_PROVIDER=manual|shiprocket`, `EMAIL_PROVIDER=resend`, `STORAGE_DRIVER=s3`, `TRUST_PROXY=true` behind a CDN). The app refuses to boot with mock providers, development secrets or Razorpay test keys in production.
2. `npm ci && npm run build`
3. `npx prisma migrate deploy` (release step — safe, forward-only; never `migrate reset` in production).
4. First deploy only: `npm run db:seed` (**without** `SEED_FIXTURES`) → roles, templates, CMS structure, draft policy pages, the six products as **drafts with zero stock**. Then `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run admin:create`.
5. Configure webhooks:
   - Razorpay Dashboard → Webhooks → `https://<domain>/api/webhooks/payments/razorpay`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`; secret = `RAZORPAY_WEBHOOK_SECRET`.
   - Shiprocket (if used) → tracking webhook `https://<domain>/api/webhooks/shipping/shiprocket` with `x-api-key` = `SHIPROCKET_WEBHOOK_TOKEN`.
6. Domain & TLS: point DNS at the host, enforce HTTPS (HSTS header is sent in production). Set `APP_URL` to the canonical https origin. Verify the email sending domain (SPF/DKIM/DMARC) with Resend.
7. Health check: `GET /api/health` (checks DB connectivity).

## Monitoring
- Logs are structured JSON on stdout with secret redaction — ship them to your platform's log store; alert on `level=error`, `payment.amount_mismatch`, `order.oversold_after_payment`, `webhook.bad_signature`, `refund.gateway_failed`, `notification.send_failed`.
- Admin → Overview shows payment failures, orders on hold and low stock; Admin → Orders filter "On hold".
- Add an uptime monitor on `/api/health` and an error tracker (e.g. Sentry) via `instrumentation.ts` if desired.

## Backups & recovery
- Enable managed daily snapshots + PITR (≥ 7 days; 30 recommended). Test a restore into a staging database quarterly.
- Media bucket: enable versioning.
- Recovery: restore DB to a new instance → point `DATABASE_URL` → `prisma migrate deploy` → run jobs once (reconciliation re-syncs payment state with Razorpay).

## Scaling notes
Rate limits and sessions are stored in Postgres, so multiple app instances work without Redis. Catalogue listing filters in memory after a visibility-scoped query — fine for hundreds of products; move filters into SQL before thousands.

## Google sign-in (optional)

Customers can use **Continue with Google** on the sign-in and sign-up pages. The button only appears when both variables are set.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create or pick a project.
2. **OAuth consent screen**: choose *External*, fill in the app name (QOWL), support email, logo and your domain. Scopes: `openid`, `email`, `profile` (all non-sensitive, so no Google review is needed). Publish the app when you go live; in *Testing* mode only listed test users can sign in.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorised JavaScript origin: your `APP_URL` (for example `https://qowl.in`, and `http://localhost:3000` for local work).
   - Authorised redirect URI: `<APP_URL>/api/auth/google/callback` (for example `https://qowl.in/api/auth/google/callback`).
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the environment and restart.

How accounts are matched:
- A new Google user gets a verified account with no password (they can set one later with *Forgot password*).
- An existing account with the same email is linked. If that account's email was never verified, its password is removed and its sessions are ended, because someone else may have registered it.
- Staff accounts can't use Google; they keep using `/admin/login`.

## Vercel

`vercel.json` runs `prisma migrate deploy` before every build and schedules `/api/cron/jobs` once a day (Vercel sends `Authorization: Bearer $CRON_SECRET` automatically).

1. **Database:** Vercel can't reach a database on your own computer. Create a hosted Postgres (Vercel → Storage → Neon). The integration sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct, used by migrations, see `prisma.config.ts`). With another provider, set `DATABASE_URL` to the pooled URL and `DATABASE_URL_UNPOOLED` to the direct one, both with `?sslmode=require`. Set `DATABASE_POOL_SIZE=3` (each serverless instance opens its own pool).
2. **Required variables** (Settings → Environment Variables, Production): `APP_URL` (e.g. `https://qowlclothing.vercel.app`), `DATABASE_URL`, `DATABASE_POOL_SIZE`, `SESSION_SECRET`, `CRON_SECRET`, `TRUST_PROXY=true`, payment (`PAYMENT_PROVIDER=razorpay` + Razorpay keys), `EMAIL_PROVIDER` (+ `RESEND_API_KEY`), storage (below), optional Google keys.
3. **Uploads:** Vercel's disk is temporary, so admin image uploads need cloud storage. Easiest: **Cloudinary** — set `STORAGE_DRIVER=cloudinary` and `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>` (Cloudinary Console → Settings → API Keys). Images are still validated, stripped of metadata and converted to WebP before upload; they're stored under `products/`, `cms/`, `collections/`, `reviews/` and `returns/`. AWS S3 / Cloudflare R2 also work with `STORAGE_DRIVER=s3`.
4. **First data:** after the first deploy, run once from your computer against the hosted database: `npm run db:setup` with `DATABASE_URL` and `DATABASE_URL_UNPOOLED` set to the hosted URLs (it applies migrations, then seeds) (`SEED_FIXTURES=true` only for a demo store), or create an owner with `npm run admin:create`.
5. **Background jobs** (expire unpaid orders, send queued emails, reconcile payments): the Hobby plan only allows daily crons. On Pro, change the schedule to `*/5 * * * *`; on Hobby, call `/api/cron/jobs` every 5 minutes from an external scheduler (e.g. cron-job.org) with the `Authorization: Bearer <CRON_SECRET>` header.
