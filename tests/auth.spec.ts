import { test } from "@playwright/test";
import { loginUi, purgeUserData } from "./helpers";

test.beforeEach(async ({ request }) => {
  await purgeUserData(request);
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("Health login smoke", async ({ page }) => {
  await loginUi(page);
});
