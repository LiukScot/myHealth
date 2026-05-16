import { expect, test } from "@playwright/test";
import { loginUi, purgeUserData } from "./helpers";

test.beforeEach(async ({ request }) => {
  await purgeUserData(request);
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("desktop shows calendar and list, create/edit/delete works", async ({ page }) => {
  await loginUi(page);
  await page.getByRole("button", { name: "Memorable days" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Memorable days" })).toBeVisible();
  await expect(page.locator(".memorable-calendar-panel")).toBeVisible();
  await expect(page.locator(".memorable-list-panel")).toBeVisible();

  await page.getByRole("button", { name: "Add new" }).click();
  await expect(page.getByRole("button", { name: "Emoji" })).toBeVisible();
  await page.getByRole("button", { name: "Emoji" }).click();
  await expect(page.getByRole("searchbox", { name: "Search emoji" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Smileys" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search emoji" }).fill("ring");
  await page.getByRole("button", { name: /ring/i }).first().click();
  await expect(page.getByRole("searchbox", { name: "Search emoji" })).toBeHidden();
  await page.getByRole("button", { name: "Emoji" }).click();
  await expect(page.getByRole("searchbox", { name: "Search emoji" })).toHaveValue("ring");
  await page.getByRole("button", { name: "Emoji" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".feedback-message.is-error")).toHaveText("Title is required.");
  await page.getByLabel("Title").fill("Wedding");
  await page.getByLabel("Description").fill("civil ceremony");
  await page.getByLabel("Repeat").selectOption("monthly");
  await page.getByRole("button", { name: "Save" }).click();

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
