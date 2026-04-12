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
  
  // Wait for chart canvas to render dynamically
  await page.waitForSelector(".chart-canvas canvas", { timeout: 5000 });
  await expect(page.locator(".chart-canvas canvas")).toBeVisible();

  // Uncheck all metrics by text label (using parent locator to find input)
  await page.getByText("Pain", { exact: true }).locator("..").locator("input[type='checkbox']").uncheck();
  await page.getByText("Fatigue", { exact: true }).locator("..").locator("input[type='checkbox']").uncheck();
  await page.getByText("Mood", { exact: true }).locator("..").locator("input[type='checkbox']").uncheck();
  await page.getByText("Depression", { exact: true }).locator("..").locator("input[type='checkbox']").uncheck();
  await page.getByText("Anxiety", { exact: true }).locator("..").locator("input[type='checkbox']").uncheck();
  
  await expect(page.getByText("Toggle on a metric to see it.")).toBeVisible();

  // Check mood again
  await page.getByText("Mood", { exact: true }).locator("..").locator("input[type='checkbox']").check();
  await page.waitForSelector(".chart-canvas canvas", { timeout: 5000 });
  await expect(page.locator(".chart-canvas canvas")).toBeVisible();

  await page.getByRole("button", { name: "1 week" }).click();
  await expect(page.getByRole("button", { name: "1 week" })).toHaveClass(/active/);
});
