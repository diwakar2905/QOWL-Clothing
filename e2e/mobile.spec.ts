import { test, expect } from "@playwright/test";
import { createProduct, fillCheckout, payMock } from "./helpers";

test("16 mobile navigation, search and checkout", async ({ page }) => {
  const p = await createProduct({ M: 2 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).first().click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Hoodies" }).click();
  await expect(page).toHaveURL(/category\/hoodies/);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("searchbox").fill(p.name);
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/search\?q=/);
  await page.getByRole("link", { name: p.name }).first().click();
  await page.getByRole("radio", { name: "M", exact: true }).click();
  await page.locator(".fixed.bottom-0").getByRole("button").click(); // sticky add-to-bag bar
  await expect(page.getByRole("dialog", { name: /Your bag/ })).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();
  await fillCheckout(page);
  await payMock(page, "Simulate success");
  await page.waitForURL(/checkout\/confirmation/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Thank you/);
});
