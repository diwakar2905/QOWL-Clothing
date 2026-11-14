# Admin guide

Sign in at `/admin/login`. What you see depends on your role (Super Admin, Store Manager, Fulfillment Staff, Content Manager, Support Staff; editable in **Staff & roles**). Every sensitive change is recorded in the **Audit log**.

## First-time setup (in this order)
1. **Settings → Business & contact**: legal name, GSTIN, seller state, registered address, customer care, grievance officer. Unset details are hidden on the site rather than invented.
2. **Settings → Tax classes**: confirm GST rates and HSN codes with your tax advisor, tick *Reviewed*. **Settings → Tax & invoices**: tick *reviewed by a tax advisor*.
3. **Settings → Shipping**: flat rate (checkout stays disabled until set), optional free-shipping threshold, coverage, optional delivery-day estimate (only if you can honour it).
4. **Settings → Payments & COD**: COD is off by default; set limits, eligible PIN prefixes and any fee (disclosed at checkout).
5. **Settings → Returns & exchanges**: enable, window, reasons, summary.
6. **Homepage & content → Pages & policies**: write and publish Shipping, Returns, Privacy, Terms and Grievance pages after legal review.
7. **Settings → Size guides**: enter measured garment specs and mark *Approved*.

## Products
**Products → (edit)**: details, pricing (₹, GST-inclusive; MRP ≥ price; optional scheduled sale), garment disclosures, SEO.
- **Colours, sizes & SKUs**: add a colour (name + swatch hex) then *Add sizes* (e.g. `S, M, L, XL, XXL`). SKUs are generated and editable; optional per-variant price override; deactivate instead of deleting sold variants.
- **Images**: upload (validated, resized, metadata stripped), set alt text, colour, view and *Concept render* flag; reorder with ↑ ↓. The first image is the listing image; the second shows on hover.
- **Publishing**: shows what's blocking publication (no variants/images; in production also unapproved specs, unreviewed tax class, missing origin/manufacturer). Publish now, schedule, unpublish or archive. *Preview product page* shows drafts to staff.

## Inventory
**Inventory** lists every variant: available (= on hand − reserved), reserved (pending checkouts), committed (paid, not shipped), returned (awaiting inspection), damaged.
- **Adjust**: Restock (+), Adjustment (±), Stock count (set on-hand), Mark damaged. A reason is required; history is per variant.
- **Bulk import CSV**: header `sku,mode,quantity,reason`, mode `add` or `set`. All rows validate first; nothing applies if any row fails. **Export CSV** for counts.

## Orders
Filter by status or *To fulfil*. On an order:
- **Mark packed → Create shipment** (book via the shipping provider, or enter courier + AWB manually) → **Record status** (Shipped, Out for delivery, Delivered, RTO). Customers are emailed at each step; COD is marked collected on delivery.
- **Cancel order** (before shipping) restores stock; optionally refunds in full.
- **Refund**: partial or full; *Original payment method* goes through Razorpay and is counted only when Razorpay confirms; *Manual* (COD/bank) requires a transaction reference.
- **On hold** orders (payment captured but stock gone, or amount mismatch): restock then *Release hold*, or cancel and refund.
- **Check payment with gateway** re-syncs a pending order. **Invoice** opens the printable GST invoice.

## Returns & exchanges
Requested → Approve/Reject (reason emailed) → Pickup scheduled → Received (units go to quarantine) → **Record inspection** (choose restock vs damaged per item — never automatic) → **Issue refund** (suggested amount = what the customer paid for those units) or **Ship replacement** for exchanges → Completed.

## Homepage & content
- **Homepage sections**: show/hide, reorder, and edit each section's content (validated JSON). Craft claims appear only when `"approved": true`.
- **Hero slides**: desktop/mobile images, headings, CTAs, schedule, concept flag. **Announcements**: scheduled bar messages. **Lookbook**: images, captions, linked products.

## Discounts
Percent or fixed, minimum bag value, max discount, dates, total and per-customer limits, first-order-only, product/collection scope. One code per order; validated on the server at bag and again under lock at checkout.

## Customers, reviews, newsletter
Customer contact details are masked unless your role has `customers.pii`. Suspend accounts or anonymise after a deletion request. Reviews come only from delivered orders and stay hidden until approved. Newsletter shows consent records; **Export CSV** is audited.
