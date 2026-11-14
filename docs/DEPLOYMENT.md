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
