import { expect, test } from "@playwright/test";
import { loginUi, purgeUserData, seedMemorableDay } from "./helpers";

test.beforeEach(async ({ request }) => {
  await purgeUserData(request);
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("desktop shows calendar and list, create/edit/delete works", async ({ page }) => {
  await loginUi(page);
  await page.getByRole("button", { name: "Giorni memorabili" }).click();

  await expect(page.getByRole("heading", { name: "Memorable days" })).toBeVisible();
  await expect(page.locator(".memorable-calendar-panel")).toBeVisible();
  await expect(page.locator(".memorable-list-panel")).toBeVisible();

  await page.getByLabel(/Add memorable day on/).first().click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".feedback-message.is-error")).toHaveText("Title is required.");
  await page.getByLabel("Emoji").fill("💍");
  await page.getByLabel("Title").fill("Wedding");
  await page.getByLabel("Description").fill("civil ceremony");
  await page.getByLabel("Repeat").selectOption("monthly");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".feedback-message.is-success")).toHaveCount(0);

  const weddingListItem = page.locator(".memorable-list-item").filter({ hasText: "Wedding" });
  await expect(weddingListItem).toBeVisible();
  await weddingListItem.click();
  await page.getByLabel("Description").fill("updated note");
  await page.getByRole("button", { name: "Save" }).click();
  await weddingListItem.click();
  await expect(page.getByLabel("Description")).toHaveValue("updated note");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await weddingListItem.click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".memorable-list-item").filter({ hasText: "Wedding" })).toHaveCount(0);
});

test("mobile hides calendar and shows floating add button", async ({ page, request }) => {
  await seedMemorableDay(request, { title: "Birthday", repeatMode: "yearly", emoji: "🎂" });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginUi(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Giorni memorabili" }).click();

  await expect(page.locator(".memorable-calendar-panel")).toBeHidden();
  await expect(page.locator(".memorable-list-panel")).toBeVisible();
  await expect(page.locator(".memorable-fab")).toBeVisible();
});

test("tablet width stacks list under calendar", async ({ page, request }) => {
  await seedMemorableDay(request, { title: "Birthday", repeatMode: "yearly", emoji: "🎂" });
  await page.setViewportSize({ width: 895, height: 766 });
  await loginUi(page);
  await page.getByRole("button", { name: "Giorni memorabili" }).click();

  const calendarBox = await page.locator(".memorable-calendar-panel").boundingBox();
  const listBox = await page.locator(".memorable-list-panel").boundingBox();

  expect(calendarBox).not.toBeNull();
  expect(listBox).not.toBeNull();
  expect((listBox?.y ?? 0)).toBeGreaterThan((calendarBox?.y ?? 0) + (calendarBox?.height ?? 0) - 1);
});
