import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const e2eUser = {
  email: process.env.E2E_EMAIL || "smoke@example.com",
  password: process.env.E2E_PASSWORD || "Password123",
};

export function uniqueText(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}

export async function loginUi(page: Page, password = e2eUser.password) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.getByLabel("Email").fill(e2eUser.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

export async function loginApi(request: APIRequestContext, password = e2eUser.password) {
  const response = await request.post("/api/v1/auth/login", {
    data: { email: e2eUser.email, password },
  });
  if (!response.ok()) {
    const body = await response.text();
    expect(
      response.ok(),
      `expected API login to succeed for ${e2eUser.email}; status=${response.status()} body=${body}`,
    ).toBeTruthy();
  }
}

export async function purgeUserData(request: APIRequestContext, password = e2eUser.password) {
  await loginApi(request, password);
  const response = await request.post("/api/v1/data/purge");
  expect(response.ok(), "expected purge to succeed").toBeTruthy();
}

export async function seedDiaryEntry(
  request: APIRequestContext,
  overrides: Partial<{
    entryDate: string;
    entryTime: string;
    moodLevel: number | null;
    depressionLevel: number | null;
    anxietyLevel: number | null;
    positiveMoods: string;
    negativeMoods: string;
    generalMoods: string;
    description: string;
    gratitude: string;
  }> = {},
  password = e2eUser.password,
) {
  await loginApi(request, password);
  const response = await request.post("/api/v1/diary", {
    data: {
      entryDate: "2026-03-28",
      entryTime: "10:30",
      moodLevel: 6,
      depressionLevel: 3,
      anxietyLevel: 4,
      positiveMoods: "happy",
      negativeMoods: "",
      generalMoods: "tired",
      description: uniqueText("dashboard-diary"),
      gratitude: "coffee",
      ...overrides,
    },
  });
  expect(response.ok(), "expected diary seed to succeed").toBeTruthy();
}

export async function seedPainEntry(
  request: APIRequestContext,
  overrides: Partial<{
    entryDate: string;
    entryTime: string;
    painLevel: number | null;
    fatigueLevel: number | null;
    coffeeCount: number | null;
    area: string;
    symptoms: string;
    activities: string;
    medicines: string;
    habits: string;
    other: string;
    note: string;
  }> = {},
  password = e2eUser.password,
) {
  await loginApi(request, password);
  const response = await request.post("/api/v1/pain", {
    data: {
      entryDate: "2026-03-28",
      entryTime: "11:00",
      painLevel: 5,
      fatigueLevel: 4,
      coffeeCount: 1,
      area: "head",
      symptoms: "nausea",
      activities: "work",
      medicines: "200mg celebrex, 4mg sirdalud",
      habits: "good sleep",
      other: "",
      note: uniqueText("dashboard-pain"),
      ...overrides,
    },
  });
  expect(response.ok(), "expected pain seed to succeed").toBeTruthy();
}

export async function openAccountPanel(page: Page) {
  const currentPasswordField = page.getByLabel("Current password");
  if (await currentPasswordField.count()) {
    await expect(currentPasswordField).toBeVisible();
    return;
  }

  const accountSummary = page.locator("summary").filter({ hasText: "Account" });
  if (await accountSummary.count()) {
    await accountSummary.click();
  }

  await expect(currentPasswordField).toBeVisible();
}

export async function navigateTo(page: Page, section: string) {
  await page.getByRole("button", { name: section }).click();
}

export async function saveBirthday(
  request: APIRequestContext,
  birthday: string | null,
  password = e2eUser.password,
) {
  await loginApi(request, password);
  const response = await request.put("/api/v1/preferences", {
    data: {
      model: "",
      chatRange: "all",
      lastRange: "all",
      graphSelection: {},
      birthday,
    },
  });
  expect(response.ok(), "expected birthday save to succeed").toBeTruthy();
}

export async function seedMemorableDay(
  request: APIRequestContext,
  overrides: Partial<{
    date: string;
    title: string;
    emoji: string;
    description: string;
    repeatMode: "one-time" | "monthly" | "yearly";
  }> = {},
  password = e2eUser.password,
) {
  await loginApi(request, password);
  const response = await request.post("/api/v1/memorable-days", {
    data: {
      date: "2024-06-10",
      title: uniqueText("memorable"),
      emoji: "✨",
      description: "important date",
      repeatMode: "monthly",
      ...overrides,
    },
  });
  expect(response.ok(), "expected memorable day seed to succeed").toBeTruthy();
}
