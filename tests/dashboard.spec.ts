import { expect, test } from "@playwright/test";
import { loginUi, purgeUserData, seedDiaryEntry, seedPainEntry } from "./helpers";

test.beforeEach(async ({ request }) => {
  await purgeUserData(request);
  await seedDiaryEntry(request);
  await seedPainEntry(request);
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("renders dashboard data and supports chart toggles", async ({ page }) => {
  await loginUi(page);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Journal entries" }).locator("strong")).toHaveText("1");
  await expect(page.locator("article").filter({ hasText: "Pain entries" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".chart-canvas canvas")).toBeVisible();

  await page.getByLabel("Pain").uncheck();
  await page.getByLabel("Fatigue").uncheck();
  await page.getByLabel("Mood").uncheck();
  await page.getByLabel("Depression").uncheck();
  await page.getByLabel("Anxiety").uncheck();
  await expect(page.getByText("Toggle on a metric to see it.")).toBeVisible();

  await page.getByLabel("Mood").check();
  await expect(page.locator(".chart-canvas canvas")).toBeVisible();

  await page.getByRole("button", { name: "1 week" }).click();
  await expect(page.getByRole("button", { name: "1 week" })).toHaveClass(/active/);
});
