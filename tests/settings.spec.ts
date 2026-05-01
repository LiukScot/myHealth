import { expect, test } from "@playwright/test";
import { e2eUser, loginUi, openAccountPanel, purgeUserData } from "./helpers";

test.beforeEach(async ({ request, page }) => {
  await purgeUserData(request);
  await loginUi(page);
  await page.getByRole("button", { name: "settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("changes password and restores the original password", async ({ page }) => {
  const temporaryPassword = "Password456";

  await openAccountPanel(page);
  await page.getByLabel("Current password").fill(e2eUser.password);
  await page.getByLabel("New password").fill(temporaryPassword);
  await page.getByLabel("Confirm").fill(temporaryPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  
  // Wait for password update confirmation
  await expect(page.getByText("Password updated.")).toBeVisible();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Log out" }).click();
  await loginUi(page, temporaryPassword);

  await page.getByRole("button", { name: "settings" }).click();
  await openAccountPanel(page);
  await page.getByLabel("Current password").fill(temporaryPassword);
  await page.getByLabel("New password").fill(e2eUser.password);
  await page.getByLabel("Confirm").fill(e2eUser.password);
  await page.getByRole("button", { name: "Change password" }).click();
  
  // Wait for password update confirmation 
  await expect(page.getByText("Password updated.")).toBeVisible();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Log out" }).click();
  await loginUi(page);
});

test("saves birthday in settings", async ({ page }) => {
  await page.getByRole("button", { name: "Birthday" }).click();
  await page.getByLabel("Birthday").fill("1995-06-12");

  // Wait for the PUT request to complete
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/v1/preferences') && response.request().method() === 'PUT'
  );
  await page.getByRole("button", { name: "Save birthday" }).click();
  await responsePromise;

  await page.reload();
  await page.getByRole("button", { name: "settings" }).click();
  await page.getByRole("button", { name: "Birthday" }).click();
  await expect(page.getByLabel("Birthday")).toHaveValue("1995-06-12");
});
