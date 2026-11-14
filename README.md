# QOWL — Direct-to-consumer streetwear platform

Production-oriented e-commerce platform for **QOWL**, an independent Indian streetwear label (DROP 001 — *The Unwritten*). One Next.js modular monolith serves the customer storefront, a protected admin dashboard at `/admin`, and a documented JSON API, all on a single PostgreSQL database.

| | |
|---|---|
| Stack | Next.js 16 (App Router) · React 19 · TypeScript 5.9 · Tailwind CSS 4 · Prisma 7 + PostgreSQL 16 · Zod 4 |
| Payments | Razorpay (Orders API, signature-verified checkout, signed webhooks, refunds); dev/test mock gateway |
| Shipping | Provider abstraction: manual fulfilment (default), Shiprocket adapter, dev mock |
| Email | Transactional outbox with retries; Resend provider (console in dev) |
| Media | Validated + re-encoded uploads; local disk or S3-compatible storage |
| Tests | Vitest unit + integration (real Postgres) · Playwright E2E (desktop + mobile) |

## Quick start (local)

```bash
cp .env.example .env            # then fill SESSION_SECRET and CRON_SECRET
docker compose up -d            # or use any local PostgreSQL 16
npm install
npm run db:deploy               # apply migrations
SEED_FIXTURES=true npm run db:seed   # base setup + clearly-marked DEV fixtures
npm run dev                     # http://localhost:3000  ·  admin at /admin
```

Development fixture logins (dev only, never seeded in production): `admin@qowl.test` / `QowlAdmin#2026dev`, `customer@qowl.test` / `QowlCustomer#2026`, staff `fulfillment@ / content@ / support@qowl.test` / `QowlStaff#2026dev`.

## Documentation

- [Architecture & decisions](docs/ARCHITECTURE.md)
- [Development setup](docs/DEVELOPMENT.md)
- [Production deployment](docs/DEPLOYMENT.md)
- [Admin usage guide](docs/ADMIN_GUIDE.md)
- [API reference](docs/API.md)
- [Security & testing report](docs/SECURITY_AND_TESTING.md)
- [Launch checklist: pending credentials, configuration & business decisions](docs/LAUNCH_CHECKLIST.md)
- [Implementation status report](docs/IMPLEMENTATION_REPORT.md)

## Important honesty notes

- Product imagery shipped in `public/concept/` is cropped from the supplied **AI concept mockups**. It is flagged `isConcept` and always shown with a "Concept render" disclosure. Replace with real garment photography before launch.
- The six DROP 001 products, prices and specifications are **provisional**. In production the seed creates them as **drafts with zero stock** and unapproved specifications; an admin must enter real data and publish.
- Tax rates/HSN codes are seeded as **"REVIEW REQUIRED"** and must be confirmed by a tax advisor.
