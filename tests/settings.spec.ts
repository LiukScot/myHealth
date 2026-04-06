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

test("saves preferences", async ({ page }) => {
  // Model and Chat range fields were removed when the Mistral chatbot was
  // replaced by the MCP server. Only the dashboard range remains.
  await page.getByLabel("Last dashboard range").selectOption("30");
  await page.getByRole("button", { name: "Save prefs" }).click();

  await page.reload();
  await page.getByRole("button", { name: "settings" }).click();

  await expect(page.getByLabel("Last dashboard range")).toHaveValue("30");
});

test("changes password and restores the original password", async ({ page }) => {
  const temporaryPassword = "Password456";

  await openAccountPanel(page);
  await page.getByLabel("Current password").fill(e2eUser.password);
  await page.getByLabel("New password").fill(temporaryPassword);
  await page.getByLabel("Confirm").fill(temporaryPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await loginUi(page, temporaryPassword);

  await openAccountPanel(page);
  await page.getByLabel("Current password").fill(temporaryPassword);
  await page.getByLabel("New password").fill(e2eUser.password);
  await page.getByLabel("Confirm").fill(e2eUser.password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await loginUi(page);
});
