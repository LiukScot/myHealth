import { expect, test } from "@playwright/test";
import { loginUi, purgeUserData, saveBirthday, seedDiaryEntry, seedMemorableDay, seedPainEntry } from "./helpers";

test.beforeEach(async ({ request }) => {
  await purgeUserData(request);
  await seedDiaryEntry(request);
  await seedPainEntry(request);
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("explains the empty dashboard state", async ({ page, request }) => {
  await purgeUserData(request);
  await loginUi(page);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("No health entries yet")).toBeVisible();
  await expect(page.getByText("Your averages will appear here after you log your first diary or pain entry.")).toBeVisible();
  await expect(page.getByText("No chart data yet. Add a diary or pain entry to get started.")).toBeVisible();
});

test("renders dashboard data and supports chart toggles", async ({ page }) => {
  await seedDiaryEntry(page.request, {
    entryDate: "2026-03-25",
    entryTime: "09:00",
    moodLevel: 4,
    depressionLevel: 4,
    anxietyLevel: 3,
    description: "tired but stable",
  });
  await seedPainEntry(page.request, {
    entryDate: "2026-03-25",
    entryTime: "09:30",
    painLevel: 3,
    fatigueLevel: 2,
    coffeeCount: 1,
    note: "manageable morning",
  });
  await seedDiaryEntry(page.request, {
    entryDate: "2026-03-26",
    entryTime: "09:00",
    moodLevel: 3,
    depressionLevel: 6,
    anxietyLevel: 7,
    description: "stressful day",
  });
  await seedPainEntry(page.request, {
    entryDate: "2026-03-26",
    entryTime: "09:30",
    painLevel: 7,
    fatigueLevel: 8,
    coffeeCount: 4,
    note: "pain spike after poor sleep",
  });
  await seedDiaryEntry(page.request, {
    entryDate: "2026-03-27",
    entryTime: "09:00",
    moodLevel: 8,
    depressionLevel: 2,
    anxietyLevel: 2,
    description: "felt much calmer",
  });
  await seedPainEntry(page.request, {
    entryDate: "2026-03-27",
    entryTime: "09:30",
    painLevel: 2,
    fatigueLevel: 3,
    coffeeCount: 0,
    note: "easy day",
  });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await loginUi(page);

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Overview", { exact: true })).toHaveCount(0);
  await expect(page.getByText("current vs previous range")).toHaveCount(0);
  await expect(page.locator(".dashboard-panel-split")).toHaveCount(0);
  const statsGrid = page.locator(".stats-grid-dashboard");
  await expect(statsGrid.locator("article").filter({ hasText: "Journal entries" }).locator("strong")).toHaveText("4");
  await expect(statsGrid.locator("article").filter({ hasText: "Pain entries" }).locator("strong")).toHaveText("4");
  await expect(page.getByText("Patterns", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1 month" })).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".dashboard-hero")).toHaveCount(0);
  await expect(page.locator(".dashboard-summary")).toHaveCount(0);
  await expect(page.locator(".dashboard-insight-card")).toHaveCount(0);
  await expect(page.locator(".dashboard-insight-list")).toBeVisible();
  await expect(statsGrid.locator("article").first()).toHaveCSS("border-top-width", "0px");
  await expect(statsGrid.locator("article").first()).toHaveCSS("box-shadow", "none");
  await expect(statsGrid.locator("article").first()).toHaveCSS("background-color", "rgb(42, 42, 48)");
  await expect(page.locator(".series-toggle").first()).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".dashboard-filters input[type='date']").first()).toHaveCSS("font-size", "13px");
  await expect(page.locator(".dashboard-filters input[type='date']").first()).toHaveCSS("font-weight", "500");
  await page.setViewportSize({ width: 850, height: 1000 });
  const firstCardBox = await statsGrid.locator("article").nth(0).boundingBox();
  expect(firstCardBox?.width ?? 0).toBeLessThanOrEqual(176);
  await page.setViewportSize({ width: 790, height: 1000 });
  const painValueBox = await statsGrid.locator("article").nth(1).locator("strong").boundingBox();
  const moodValueBox = await statsGrid.locator("article").nth(2).locator("strong").boundingBox();
  expect(painValueBox?.y).toBe(moodValueBox?.y);

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

test("shows anniversary cards above averages", async ({ page, request }) => {
  const now = new Date();
  const yyyy = now.getFullYear() - 2;
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  await seedMemorableDay(request, {
    date: `${yyyy}-${mm}-${dd}`,
    title: "Wedding",
    emoji: "💍",
    repeatMode: "monthly",
  });
  await saveBirthday(request, `1995-${mm}-${dd}`);
  await loginUi(page);

  await expect(page.getByText("Anniversaries today")).toBeVisible();
  await expect(page.getByText(/months since wedding/i)).toBeVisible();
  await expect(page.getByText(/years since birth/i)).toBeVisible();
});
