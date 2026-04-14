import { expect, test } from "@playwright/test";
import { loginUi, navigateTo, purgeUserData, uniqueText } from "./helpers";

test.beforeEach(async ({ request, page }) => {
  await purgeUserData(request);
  await loginUi(page);
  await navigateTo(page, "diary");
  await expect(page.getByRole("heading", { name: "Diary" })).toBeVisible();
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("shows a diary empty state when there are no entries", async ({ page }) => {
  await expect(page.getByText("No diary entries yet")).toBeVisible();
  await expect(page.getByText("Use the form above to log your first mood entry. Once you save it, it will appear here.")).toBeVisible();
});

test("creates, edits, and deletes a diary entry", async ({ page }) => {
  const description = uniqueText("diary-description");
  const updatedDescription = uniqueText("diary-updated");

  await page.getByLabel("Mood (1-9)").fill("7");
  await page.getByLabel("Depression (1-9)").fill("2");
  await page.getByLabel("Anxiety (1-9)").fill("3");
  await page.locator(".multi-option-chip", { hasText: "happy" }).click();
  await page.locator(".multi-option-chip", { hasText: "sad" }).click();
  await page.locator(".multi-option-chip", { hasText: "tired" }).click();
  await page.getByLabel("Description").fill(description);
  await page.getByLabel("Gratitude").fill("warm shower");
  await page.getByLabel("Reflection").fill("kept a steady pace");
  await page.locator(".form-grid button[type='submit']").click();
  
  // Wait for entry to appear in table
  await page.waitForSelector(".diary-table tbody tr", { timeout: 5000 });
  await expect(page.getByRole("cell", { name: description })).toBeVisible();

  const row = page.locator(".diary-table tbody tr").filter({ hasText: description });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Description").fill(updatedDescription);
  await page.locator(".form-grid button[type='submit']").click();

  // Wait for update to reflect in table
  await page.waitForSelector(".diary-table tbody tr", { timeout: 5000 });
  await expect(page.getByRole("cell", { name: updatedDescription })).toBeVisible();

  const updatedRow = page.locator(".diary-table tbody tr").filter({ hasText: updatedDescription });
  await updatedRow.getByRole("button", { name: "Delete" }).click();
  await updatedRow.getByRole("button", { name: "Delete?" }).click();

  await expect(page.getByText(updatedDescription)).not.toBeVisible();
});
