import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { hash } from "@node-rs/argon2";
import { expect, type Page } from "@playwright/test";

export const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://qowl:qowl_dev_password@localhost:5432/qowl_test", max: 3 });
export const MOCK_SECRET = "e2e-mock-secret";
export const uid = () => randomUUID().replace(/-/g, "").slice(0, 10);
export const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

/** Creates an isolated, published product with one colour and the given per-size stock. */
export async function createProduct(stock: Record<string, number>, price = 150000) {
  const s = uid();
  const cat = (await pool.query(`SELECT id FROM "Category" WHERE slug='t-shirts'`)).rows[0].id;
  const tax = (await pool.query(`SELECT id FROM "TaxClass" LIMIT 1`)).rows[0].id;
  const id = `e2ep${s}`;
  const name = `E2E Tee ${s}`;
  await pool.query(
    `INSERT INTO "Product"(id,name,slug,"styleCode",description,"categoryId","garmentType",status,price,mrp,"taxClassId","searchText","publishedAt","updatedAt")
     VALUES($1,$2,$3,$4,'End-to-end test product','${cat}','Oversized T-shirt','ACTIVE',$5,$5,'${tax}',$6,now(),now())`,
    [id, name, `e2e-${s}`, `E2E-${s.toUpperCase()}`, price, name.toLowerCase()],
  );
  await pool.query(`INSERT INTO "ProductColor"(id,"productId",name,slug,hex) VALUES($1,$2,'Black','black','#111111')`, [`e2ec${s}`, id]);
  await pool.query(`INSERT INTO "ProductImage"(id,"productId",url,alt,"sortOrder") VALUES($1,$2,'/concept/origin-front.webp','E2E product image',0)`, [`e2ei${s}`, id]);
  const variants: Record<string, string> = {};
  let rank = 0;
  for (const [size, qty] of Object.entries(stock)) {
    const vid = `e2ev${s}${size}`;
    await pool.query(`INSERT INTO "ProductVariant"(id,"productId","colorId",size,"sizeRank",sku,"updatedAt") VALUES($1,$2,$3,$4,$5,$6,now())`, [vid, id, `e2ec${s}`, size, rank++, `E2E-${s.toUpperCase()}-${size}`]);
    await pool.query(`INSERT INTO "InventoryLevel"("variantId","onHand","updatedAt") VALUES($1,$2,now())`, [vid, qty]);
    variants[size] = vid;
  }
  return { id, slug: `e2e-${s}`, name, variants };
}

export async function stock(variantId: string) {
  return (await pool.query(`SELECT "onHand","reserved","committed","returnedPending" FROM "InventoryLevel" WHERE "variantId"=$1`, [variantId])).rows[0];
}

export async function order(number: string) {
  return (await pool.query(`SELECT * FROM "Order" WHERE number=$1`, [number])).rows[0];
}

export async function addToBag(page: Page, slug: string, size: string) {
  await page.goto(`/products/${slug}`);
  await page.getByRole("radio", { name: size, exact: true }).click();
  await page.getByRole("button", { name: /Add to bag/ }).first().click();
  await expect(page.getByRole("dialog", { name: /Your bag/ })).toBeVisible();
}

/** Creates a verified customer and signs in on the current login page (checkout requires sign-in). */
export async function signInNewShopper(page: Page) {
  const email = `e2e-shopper-${uid()}@example.com`;
  const password = "E2E-shopper-pass-1";
  await pool.query(
    `INSERT INTO "User"(id,email,"passwordHash",name,"emailVerifiedAt","updatedAt") VALUES($1,$2,$3,'E2E Shopper',now(),now())`,
    [`e2eu${uid()}`, email, await hash(password)],
  );
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/checkout$/);
  return email;
}

export async function fillCheckout(page: Page, opts: { email?: string; skipContact?: boolean } = {}) {
  // Guests are sent to sign in first and brought back with their bag.
  // Wait for whichever page actually rendered (the redirect can land after the URL changes).
  const heading = page.getByRole("heading", { level: 1, name: /^(Sign in|Checkout)$/i });
  await heading.waitFor();
  if (/sign in/i.test((await heading.textContent()) ?? "")) await signInNewShopper(page);
  await page.getByLabel("Mobile number", { exact: true }).waitFor();
  // Signed-in shoppers use their account email (the field is read-only).
  if (!opts.skipContact && (await page.getByLabel("Email", { exact: true }).isEditable())) await page.getByLabel("Email", { exact: true }).fill(opts.email ?? `e2e-${uid()}@example.com`);
  await page.getByLabel("Mobile number", { exact: true }).fill(phone());
  await page.getByLabel("Full name", { exact: true }).fill("E2E Shopper");
  await page.getByRole("textbox", { name: "Address line 1" }).fill("221 Test Street");
  await page.getByRole("textbox", { name: "PIN code" }).fill("400001");
  await page.getByRole("textbox", { name: "City" }).fill("Mumbai");
  await page.getByLabel("State").selectOption("Maharashtra");
  await page.getByLabel(/I agree to the/).check();
}

export async function payMock(page: Page, outcome: "Simulate success" | "Simulate failure" | "Close window") {
  await page.getByRole("button", { name: /^(Pay|Retry payment|Place order)/ }).click();
  await page.getByRole("dialog", { name: /Test payment/ }).waitFor();
  await page.getByRole("button", { name: outcome }).click();
}

export async function loginAs(page: Page, email: string, password: string, admin = false) {
  await page.goto(admin ? "/admin/login" : "/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(admin ? /\/admin$/ : /\/account/);
}

export function signMock(body: string) {
  return createHmac("sha256", MOCK_SECRET).update(body).digest("hex");
}
