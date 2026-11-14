# Launch checklist — pending credentials, configuration & business decisions

Admin → Overview shows a live **Launch readiness** panel for most of these.

## External credentials (not available in this build — required before launch)
| Item | Where | Notes |
|---|---|---|
| Razorpay **test** keys + webhook secret | env `RAZORPAY_*` | Run a full sandbox pass (UPI, cards, failure, refund) before going live. **Not yet verified against Razorpay's sandbox in this repository** — only signature algorithms (unit-tested) and the mock gateway path (integration + E2E). |
| Razorpay **live** keys | env | App refuses `rzp_test_` keys in production. Enable auto-capture on the account. |
| Email provider (Resend) API key + verified sending domain (SPF/DKIM/DMARC) | env `RESEND_API_KEY`, `EMAIL_FROM` | Until set, emails are only logged. |
| S3-compatible bucket + CDN | env `S3_*`, `MEDIA_PUBLIC_BASE_URL` | Required for multi-instance hosting. |
| Shiprocket account (optional) | env `SHIPROCKET_*` | Adapter implemented but **not verified against the live API**; manual fulfilment works without it. |
| Managed PostgreSQL with backups/PITR | env `DATABASE_URL` | |
| `SESSION_SECRET`, `CRON_SECRET`, scheduler for `/api/cron/jobs` | env + host scheduler | |
| SMS/WhatsApp provider | — | Not implemented; requires DLT template registration and explicit consent flows. |

## Legal, tax & business facts (must come from QOWL — never invented)
- Legal entity name, **GSTIN**, registered address, seller state.
- GST rates and **HSN codes** for each garment type (seeded values marked *REVIEW REQUIRED*: 5% ≤ ₹2,500 per piece / 18% above; HSN 6109 tees, 6110 hoodies) — confirm with a tax advisor, then tick *Reviewed* on each tax class and in Tax & invoices.
- Invoice numbering format/prefix (default `QWL/<FY>/00001`).
- Customer care email/phone/hours and **Grievance Officer** details (Consumer Protection (E-Commerce) Rules, 2020).
- Shipping rate, free-shipping threshold (if any), serviceable areas, honest delivery estimates.
- Return/exchange policy and window; COD enablement, limits and fee.
- Policy pages (Shipping, Returns, Privacy, Terms, Grievance) written and **reviewed by counsel** — seeded only as draft skeletons.
- Privacy: confirm DPDP Act 2023 obligations (notice, consent, deletion handling SLA).

## Product & content
- Final garment specs (fabric, GSM, fit, care), manufacturer/marketer name & address, country of origin, net quantity → tick *Specifications approved*.
- Measured size charts → Settings → Size guides → *Approved*. (The seeded dev size guide is a fixture.)
- Real product photography replacing concept renders (`/concept/*`); real stock counts.
- Final prices/MRP (seed values are provisional).
- Hero, campaign, craft, lookbook imagery; craft claims marked approved only when true.
- Replace the dev announcement; set SEO defaults and social share image.

## Production data hygiene
- Seed production **without** `SEED_FIXTURES` (refused with `NODE_ENV=production` anyway).
- Create the first admin with `npm run admin:create`; enable a password manager; do not reuse dev passwords.
- Confirm no `isFixture` products are active (dashboard check).
