import { describe, expect, test } from "bun:test";
import authRoute from "./auth.ts";
import memorableDaysRoute from "./memorable-days.ts";
import preferencesRoute from "./preferences.ts";
import { extractSessionCookie, seedUser, setupAuthedApp } from "../test-helpers.ts";

async function setup() {
  const s = await setupAuthedApp([
    { path: "/auth", route: authRoute },
    { path: "/memorable-days", route: memorableDaysRoute },
    { path: "/preferences", route: preferencesRoute },
  ]);
  return { ctx: s.ctx, app: s.app, cookie: s.cookie, userId: s.user.id };
}

const validBody = {
  date: "2026-08-15",
  title: "Summer trip",
  emoji: "🏖️",
  description: "beach week",
  repeatMode: "yearly" as const,
};

describe("memorable-days auth", () => {
  test("GET / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/memorable-days");
    expect(res.status).toBe(401);
  });

  test("POST / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /memorable-days", () => {
  test("creates entry with valid body 201", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeGreaterThan(0);
  });

  test("rejects invalid calendar date with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, date: "2026-02-30" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty title with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, title: "   " }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects unknown repeat mode with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, repeatMode: "weekly" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /memorable-days", () => {
  test("returns empty list when no entries", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/memorable-days", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  test("returns birthday as virtual item when set in preferences", async () => {
    const { app, cookie } = await setup();
    await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        model: "mistral-small-latest",
        chatRange: "all",
        lastRange: "all",
        graphSelection: {},
        birthday: "1990-06-15",
      }),
    });
    const res = await app.request("/memorable-days?today=2026-05-16", { headers: { cookie } });
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].source).toBe("birthday");
    expect(body.data[0].title).toBe("Birth");
  });

  test("isolates entries across users (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    const created = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(created.status).toBe(201);
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await app.request("/memorable-days", { headers: { cookie: otherCookie } });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("PUT /memorable-days/:id", () => {
  test("updates entry and returns ok", async () => {
    const { app, cookie } = await setup();
    const created = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    const { data } = await created.json();
    const res = await app.request(`/memorable-days/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, title: "Updated title" }),
    });
    expect(res.status).toBe(200);
  });

  test("returns 404 for non-numeric id (NaN guard regression)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/memorable-days/abc", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  test("cannot update another user's entry (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    const created = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(created.status).toBe(201);
    const { data } = await created.json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await app.request(`/memorable-days/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: otherCookie },
      body: JSON.stringify({ ...validBody, title: "hacker" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /memorable-days/:id", () => {
  test("deletes entry and returns ok", async () => {
    const { app, cookie } = await setup();
    const created = await app.request("/memorable-days", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    const { data } = await created.json();
    const res = await app.request(`/memorable-days/${data.id}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);
  });

  test("returns 404 for non-numeric id (NaN guard regression)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/memorable-days/abc", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(404);
  });
});
