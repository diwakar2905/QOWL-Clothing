import { test, expect } from "@playwright/test";
import { addToBag, createProduct, fillCheckout, order, payMock, pool, stock, signMock, uid, loginAs } from "./helpers";

test.describe("Shopping", () => {
  test("1/7/18 guest is asked to sign in at checkout, keeps the bag, pays; refresh does not duplicate", async ({ page }) => {
    const p = await createProduct({ M: 3 });
    await page.goto("/");
    await expect(page).not.toHaveURL(/login/); // browsing needs no account
    await addToBag(page, p.slug, "M");
    await page.getByRole("link", { name: "Checkout" }).click();
    await page.waitForURL(/\/login\?next=%2Fcheckout|\/login\?next=\/checkout/);
    await expect(page.getByText("Sign in to complete your order")).toBeVisible();
    await fillCheckout(page);
    await payMock(page, "Simulate success");
    await page.waitForURL(/checkout\/confirmation/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Thank you/);
    const number = new URL(page.url()).searchParams.get("order")!;
    expect((await order(number)).status).toBe("CONFIRMED");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Thank you/);
    const count = (await pool.query(`SELECT count(*)::int c FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id WHERE i."variantId"=$1`, [p.variants.M])).rows[0].c;
    expect(count).toBe(1);
    expect(await stock(p.variants.M)).toMatchObject({ onHand: 2, reserved: 0, committed: 1 });
  });

  test("3/17 direct PDP load; colour & size selection updates availability", async ({ page }) => {
    await page.goto("/products/eclipse");
    await expect(page.getByRole("heading", { level: 1, name: "Eclipse" })).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached();
    await page.getByRole("button", { name: /Burgundy/ }).click();
    await expect(page.getByText(/Colour:\s*Burgundy/)).toBeVisible();
    await page.getByRole("radio", { name: "L", exact: true }).click();
    await expect(page.getByRole("radio", { name: "L", exact: true })).toHaveAttribute("aria-checked", "true");
  });

  test("4 out-of-stock size cannot be purchased", async ({ page }) => {
    const p = await createProduct({ S: 0, M: 1 });
    await page.goto(`/products/${p.slug}`);
    await expect(page.getByRole("radio", { name: /^S/ })).toBeDisabled();
    const res = await page.request.post("/api/cart/items", { data: { variantId: p.variants.S, quantity: 1 }, headers: { Origin: "http://localhost:3100" } });
    expect(res.status()).toBe(409);
  });

  test("5 two concurrent buyers for the last unit: only one gets it", async ({ browser }) => {
    const p = await createProduct({ M: 1 });
    const [a, b] = [await browser.newContext(), await browser.newContext()];
    const [pa, pb] = [await a.newPage(), await b.newPage()];
    for (const pg of [pa, pb]) await addToBag(pg, p.slug, "M");
    for (const pg of [pa, pb]) { await pg.goto("/checkout"); await fillCheckout(pg); }
    await Promise.all([pa.getByRole("button", { name: /^Pay/ }).click(), pb.getByRole("button", { name: /^Pay/ }).click()]);
    const outcomes = await Promise.all([pa, pb].map(async (pg) => {
      const dialog = pg.getByRole("dialog", { name: /Test payment/ });
      const err = pg.getByRole("alert").filter({ hasText: /no longer available|unavailable in the requested/ }).first();
      await expect(dialog.or(err).first()).toBeVisible();
      return (await dialog.isVisible()) ? "got-unit" : "rejected";
    }));
    expect(outcomes.sort()).toEqual(["got-unit", "rejected"]);
    expect(await stock(p.variants.M)).toMatchObject({ onHand: 1, reserved: 1 });
    await a.close(); await b.close();
  });

  test("6 payment failure shows a clear message and can be retried", async ({ page }) => {
    const p = await createProduct({ M: 2 });
    await addToBag(page, p.slug, "M");
    await page.goto("/checkout");
    await fillCheckout(page);
    await payMock(page, "Simulate failure");
    await expect(page.getByRole("alert").filter({ hasText: /declined|failed|didn't go through/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry payment/ })).toBeVisible();
    await payMock(page, "Simulate success");
    await page.waitForURL(/checkout\/confirmation/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Thank you/);
  });

  test("6b after a failed payment, switching to COD places a fresh order and releases the old one", async ({ page }) => {
    const p = await createProduct({ M: 1 });
    await addToBag(page, p.slug, "M");
    await page.goto("/checkout");
    await fillCheckout(page);
    await payMock(page, "Simulate failure");
    await expect(page.getByRole("button", { name: /Retry payment/ })).toBeVisible();
    await page.getByRole("radio", { name: /Cash on Delivery/ }).check();
    await page.getByRole("button", { name: /Place order/ }).click();
    await page.waitForURL(/checkout\/confirmation/);
    const number = new URL(page.url()).searchParams.get("order")!;
    expect((await order(number)).paymentMethod).toBe("COD");
    const rows = (await pool.query(`SELECT o.status, o."paymentMethod" FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id WHERE i."variantId"=$1 ORDER BY o."placedAt"`, [p.variants.M])).rows;
    expect(rows).toEqual([{ status: "EXPIRED", paymentMethod: "ONLINE" }, { status: "CONFIRMED", paymentMethod: "COD" }]);
    expect(await stock(p.variants.M)).toMatchObject({ onHand: 0, reserved: 0, committed: 1 });
  });

  test("8 a duplicated payment webhook is processed once", async ({ page, request }) => {
    const p = await createProduct({ M: 2 });
    await addToBag(page, p.slug, "M");
    await page.goto("/checkout");
    await fillCheckout(page);
    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.getByRole("dialog", { name: /Test payment/ }).waitFor();
    const pay = (await pool.query(`SELECT p."providerOrderId", o.number, o."grandTotal" FROM "Payment" p JOIN "Order" o ON o.id=p."orderId" JOIN "OrderItem" i ON i."orderId"=o.id WHERE i."variantId"=$1`, [p.variants.M])).rows[0];
    // Simulate the gateway capturing, then deliver the same signed webhook twice.
    const sim = await page.request.post("/api/payments/mock/simulate", { data: { providerOrderId: pay.providerOrderId, outcome: "success" }, headers: { Origin: "http://localhost:3100" } });
    const sbody = await sim.json();
    const body = JSON.stringify({ event: "payment.captured", payment: { id: sbody.data.razorpay_payment_id, orderId: pay.providerOrderId, status: "captured", amount: pay.grandTotal, currency: "INR" } });
    const headers = { "content-type": "application/json", "x-mock-signature": signMock(body), "x-mock-event-id": `evt_${uid()}` };
    const r1 = await request.post("/api/webhooks/payments/mock", { data: body, headers });
    const r2 = await request.post("/api/webhooks/payments/mock", { data: body, headers });
    expect((await r1.json()).duplicate).toBe(false);
    expect((await r2.json()).duplicate).toBe(true);
    const bad = await request.post("/api/webhooks/payments/mock", { data: body, headers: { ...headers, "x-mock-signature": "0".repeat(64) } });
    expect(bad.status()).toBe(401);
    expect((await order(pay.number)).status).toBe("CONFIRMED");
    const sales = (await pool.query(`SELECT count(*)::int c FROM "InventoryMovement" WHERE "variantId"=$1 AND type='SALE'`, [p.variants.M])).rows[0].c;
    expect(sales).toBe(1);
  });

  test("14 customer applies a coupon", async ({ page }) => {
    const p = await createProduct({ M: 2 }, 250000);
    await addToBag(page, p.slug, "M");
    await page.goto("/cart");
    await page.getByLabel("Discount code").fill("FLAT200");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/FLAT200/).first()).toBeVisible();
    await expect(page.getByText("−₹200").first()).toBeVisible();
  });

  test("2 registered customer checks out and sees the order in history", async ({ page }) => {
    const p = await createProduct({ M: 2 });
    await loginAs(page, "customer@qowl.test", "QowlCustomer#2026");
    await addToBag(page, p.slug, "M");
    await page.goto("/checkout");
    await fillCheckout(page, { skipContact: true });
    await payMock(page, "Simulate success");
    await page.waitForURL(/checkout\/confirmation/);
    const number = new URL(page.url()).searchParams.get("order")!;
    await page.goto("/account/orders");
    await expect(page.getByText(number)).toBeVisible();
  });
});
