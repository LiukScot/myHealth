import { expect, test } from "@playwright/test";
import { loginUi, navigateTo, purgeUserData } from "./helpers";

test.beforeEach(async ({ request, page }) => {
  await purgeUserData(request);
  await loginUi(page);
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("shows empty states for CBT and DBT", async ({ page }) => {
  await navigateTo(page, "CBT");
  await expect(page.getByRole("heading", { name: "CBT Thought Response" })).toBeVisible();
  await expect(page.getByText("No CBT entries yet")).toBeVisible();
  await expect(page.getByText("Use the prompts above to record your first thought response. Completed reflections will appear here.")).toBeVisible();

  await navigateTo(page, "DBT");
  await expect(page.getByRole("heading", { name: "DBT Distress Tolerance" })).toBeVisible();
  await expect(page.getByText("No DBT entries yet")).toBeVisible();
  await expect(page.getByText("Work through the steps above to log your first distress-tolerance practice. Saved entries will appear here.")).toBeVisible();
});