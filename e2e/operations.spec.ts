import { test, expect } from "@playwright/test";
import { createProduct, pool, stock, loginAs, uid, addToBag, fillCheckout, payMock } from "./helpers";

const ADMIN = ["admin@qowl.test", "QowlAdmin#2026dev"] as const;

test.describe("Admin & post-purchase", () => {
  test("15 unauthorized users cannot reach admin or admin APIs", async ({ page, request }) => {
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/login/);
    await loginAs(page, "customer@qowl.test", "QowlCustomer#2026");
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/admin\/login/);
    expect((await request.get("/api/admin/inventory/export")).status()).toBe(401);
    expect((await page.request.get("/api/admin/newsletter/export")).status()).toBe(403);
    // Staff without the permission are refused too.
    const ctx = page.context(); await ctx.clearCookies();
    await loginAs(page, "content@qowl.test", "QowlStaff#2026dev", true);
    await page.goto("/admin/orders");
    await expect(page.getByText(/permission/i)).toBeVisible();
  });

  test("11 admin adds a product (draft with variants)", async ({ page }) => {
    await loginAs(page, ...ADMIN, true);
    await page.goto("/admin/products/new");
    const code = `QWL-T-${uid().slice(0, 5).toUpperCase()}`;
    await page.getByLabel("Name", { exact: true }).fill(`Nightfall ${code}`);
    await page.getByLabel("Style code (SKU base)").fill(code);
    await page.getByLabel("Category").selectOption({ label: "T-Shirts" });
    await page.getByLabel("Generic name / garment type").fill("Oversized T-shirt");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("A test product created through the admin UI.");
    await page.getByLabel("Selling price").fill("1499");
    await page.getByLabel("Tax class").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.waitForURL(/\/admin\/products\/[a-z0-9]+\?created=1/);
    await page.getByLabel("New colour name").fill("Ink");
    await page.getByLabel("Swatch hex", { exact: true }).last().fill("#101828");
    await page.getByRole("button", { name: "Add colour" }).click();
    await page.getByLabel("Add sizes (comma separated)").fill("M, L");
    await page.getByRole("button", { name: "Add sizes" }).click();
    await expect(page.locator(`input[value="${code}-IKK-M"], input[value^="${code}-"]`).first()).toBeVisible();
    const row = (await pool.query(`SELECT status, price FROM "Product" WHERE "styleCode"=$1`, [code])).rows[0];
    expect(row).toEqual({ status: "DRAFT", price: 149900 });
  });

  test("12 admin restocks inventory with an audit trail", async ({ page }) => {
    const p = await createProduct({ M: 1 });
    await loginAs(page, ...ADMIN, true);
    await page.goto(`/admin/inventory?q=${encodeURIComponent(p.name)}`);
    await page.getByRole("button", { name: "Adjust" }).first().click();
    await page.getByLabel("Quantity").fill("12");
    await page.getByLabel("Reason", { exact: true }).fill("Production batch received");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect.poll(async () => (await stock(p.variants.M)).onHand).toBe(13);
    const audit = (await pool.query(`SELECT count(*)::int c FROM "InventoryMovement" WHERE "variantId"=$1 AND type='RESTOCK'`, [p.variants.M])).rows[0].c;
    expect(audit).toBe(1);
  });

  test("13 admin updates homepage hero copy and it appears on the storefront", async ({ page }) => {
    await loginAs(page, ...ADMIN, true);
    await page.goto("/admin/content?tab=hero");
    const sub = `Wear Your Own Code ${uid().slice(0, 4)}.`;
    await page.getByLabel("Subheading").first().fill(sub);
    await page.getByRole("button", { name: "Save slide" }).first().click();
    await expect(page.getByText("Hero slide saved.")).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(sub)).toBeVisible();
  });

  test("9/10 customer requests a return; admin inspects and refunds", async ({ page, browser }) => {
    const p = await createProduct({ M: 3 });
    await loginAs(page, "customer@qowl.test", "QowlCustomer#2026");
    await addToBag(page, p.slug, "M");
    await page.goto("/checkout");
    await fillCheckout(page, { skipContact: true });
    await payMock(page, "Simulate success");
    await page.waitForURL(/checkout\/confirmation/);
    const number = new URL(page.url()).searchParams.get("order")!;
    // Mark delivered (fulfilment is covered by integration tests).
    await pool.query(`UPDATE "Order" SET "fulfillmentStatus"='DELIVERED', status='COMPLETED', "deliveredAt"=now() WHERE number=$1`, [number]);
    await pool.query(`UPDATE "InventoryLevel" SET committed=committed-1 WHERE "variantId"=$1`, [p.variants.M]);
    await page.goto(`/account/orders/${number}/return`);
    await page.locator("select").first().selectOption("1");
    await page.getByLabel("Reason").selectOption("Size too large");
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByText(/submitted/)).toBeVisible();

    const admin = await (await browser.newContext()).newPage();
    await loginAs(admin, ...ADMIN, true);
    const rr = (await pool.query(`SELECT r.id FROM "ReturnRequest" r JOIN "Order" o ON o.id=r."orderId" WHERE o.number=$1`, [number])).rows[0];
    for (const to of ["APPROVED", "RECEIVED"]) {
      await admin.goto(`/admin/returns/${rr.id}`);
      await admin.getByLabel("Move to").selectOption(to);
      await admin.getByRole("button", { name: "Update" }).click();
      await expect.poll(async () => (await pool.query(`SELECT status FROM "ReturnRequest" WHERE id=$1`, [rr.id])).rows[0].status).toBe(to);
    }
    await admin.goto(`/admin/returns/${rr.id}`);
    await admin.getByRole("button", { name: "Record inspection" }).click();
    await expect.poll(async () => (await pool.query(`SELECT status FROM "ReturnRequest" WHERE id=$1`, [rr.id])).rows[0].status).toBe("INSPECTED");
    await admin.goto(`/admin/returns/${rr.id}`);
    admin.once("dialog", (d) => d.accept());
    await admin.getByRole("button", { name: "Issue refund" }).click();
    await expect.poll(async () => (await pool.query(`SELECT "paymentStatus","refundedTotal" FROM "Order" WHERE number=$1`, [number])).rows[0].refundedTotal).toBe(150000);
    // Item refunded; shipping is not part of a return refund, so the order is partially refunded.
    expect((await pool.query(`SELECT "paymentStatus" FROM "Order" WHERE number=$1`, [number])).rows[0].paymentStatus).toBe("PARTIALLY_REFUNDED");
    expect(await stock(p.variants.M)).toMatchObject({ onHand: 3, returnedPending: 0 });
  });
});
