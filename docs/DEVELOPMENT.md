# Development setup

## Prerequisites
Node.js 22+, PostgreSQL 16 (via `docker compose up -d` or a local install), npm.

## Steps
```bash
cp .env.example .env
# Set SESSION_SECRET (openssl rand -base64 48) and CRON_SECRET; keep PAYMENT_PROVIDER=mock, SHIPPING_PROVIDER=mock
npm install                  # runs `prisma generate`
npm run db:deploy            # apply migrations
SEED_FIXTURES=true npm run db:seed
npm run dev
```

- Storefront: http://localhost:3000 · Admin: http://localhost:3000/admin
- The **mock payment gateway** shows a "Test payment" dialog with *Simulate success / failure / close*. It uses real HMAC signatures and the same server verification path as Razorpay. It is refused when `NODE_ENV=production`.
- The **mock shipping provider** treats PIN codes starting with `9` as unserviceable (to exercise that path).
- Emails are logged to the console (`EMAIL_PROVIDER=console`) and stored in `NotificationOutbox`.
- Background jobs: `npm run jobs:run` (or `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/jobs`).

## Database changes
1. Edit `prisma/schema.prisma`.
2. Generate a migration SQL file and review it:
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql`
   (or `npx prisma migrate dev --name <name>` interactively).
3. `npm run db:deploy`. Hand-written CHECK constraints live in the `init` migration; Prisma does not track them, so they survive future diffs.

## Tests
```bash
createdb qowl_test                 # once (docker compose creates it automatically)
npm run test:unit                  # pure domain logic
npm run test:integration           # services against qowl_test (migrate deploy + idempotent seed; never wipes data)
npm run test:e2e                   # Playwright: starts `next dev` on :3100 against qowl_test with mock providers
npm run typecheck && npm run lint
```
Set `TEST_DATABASE_URL` to point tests at a different database. Tests create isolated products/emails per run, so the test database can be reused.

## Brand assets
`python3 -I scripts/extract-assets.py` regenerates `public/brand/*` (the supplied logo, recoloured on transparency — artwork unaltered) and `public/concept/*` (concept-image crops) from `design-references/`.
