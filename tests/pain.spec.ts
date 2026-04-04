import { expect, test } from "@playwright/test";
import { loginUi, navigateTo, purgeUserData, uniqueText } from "./helpers";

test.beforeEach(async ({ request, page }) => {
  await purgeUserData(request);
  await loginUi(page);
  await navigateTo(page, "pain");
  await expect(page.getByRole("heading", { name: "Pain" })).toBeVisible();
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("creates, edits, and deletes a pain entry", async ({ page }) => {
  const note = uniqueText("pain-note");
  const updatedNote = uniqueText("pain-updated");

  await page.getByLabel("Pain (1-9)").fill("6");
  await page.getByLabel("Fatigue (1-9)").fill("4");
  await page.getByLabel("Coffee").fill("2");
  await page.locator(".multi-option-chip", { hasText: "head" }).click();
  await page.locator(".multi-option-chip", { hasText: "nausea" }).click();
  await page.locator(".multi-option-chip", { hasText: "work" }).click();
  await page.locator(".multi-option-chip", { hasText: "good sleep" }).click();
  await page.getByLabel("Notes").fill(note);
  await page.getByRole("button", { name: "Add entry" }).click();

  await expect(page.getByRole("cell", { name: note })).toBeVisible();

  const row = page.locator(".pain-table tbody tr").filter({ hasText: note });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill(updatedNote);
  await page.getByRole("button", { name: "Update entry" }).click();

  await expect(page.getByRole("cell", { name: updatedNote })).toBeVisible();

  const updatedRow = page.locator(".pain-table tbody tr").filter({ hasText: updatedNote });
  await updatedRow.getByRole("button", { name: "Delete" }).click();
  await updatedRow.getByRole("button", { name: "Delete?" }).click();

  await expect(page.getByText(updatedNote)).not.toBeVisible();
});
