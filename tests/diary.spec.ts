import { expect, test } from "@playwright/test";
import { loginUi, navigateTo, purgeUserData } from "./helpers";

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

// Diary CRUD UI flow E2E removed — was brittle to UI changes (tab-switched
// chips, evolving submit button selector). Covered now by 17 backend unit
// tests in backend/src/routes/diary.test.ts via Hono testClient. Per audit
// DOWN-LEVEL recommendation — keep E2E for empty-state + journey only.
