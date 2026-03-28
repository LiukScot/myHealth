import { test } from "@playwright/test";
import { loginUi, purgeUserData } from "./helpers";

test.beforeEach(async ({ request }) => {
  await purgeUserData(request);
});

test.afterEach(async ({ request }) => {
  await purgeUserData(request);
});

test("myHealth login smoke", async ({ page }) => {
  await loginUi(page);
});
