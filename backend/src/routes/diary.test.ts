import { describe, expect, test, beforeEach } from "bun:test";
import authRoute from "./auth.ts";
import diaryRoute from "./diary.ts";
import { Hono } from "hono";
import {
  createTestApp,
  createTestDb,
  extractSessionCookie,
  seedUser,
  type TestContext,
} from "../test-helpers.ts";

async function setup(): Promise<{
  ctx: TestContext;
  app: Hono<any>;
  cookie: string;
  userId: number;
}> {
  const ctx = createTestDb();
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("db", ctx.db);
    c.set("rawDb", ctx.rawDb);
    await next();
  });
  app.route("/auth", authRoute);
  app.route("/diary", diaryRoute);
  const seeded = await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
  });
  const cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));
  return { ctx, app, cookie, userId: seeded.id };
}

const validBody = {
  entryDate: "2026-05-16",
  entryTime: "08:30",
  moodLevel: 7,
  depressionLevel: 2,
  anxietyLevel: 3,
  positiveMoods: "happy",
  negativeMoods: "",
  generalMoods: "calm",
  description: "Test entry",
  gratitude: "grateful for tests",
};

describe("diary route auth", () => {
  test("GET / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/diary");
    expect(res.status).toBe(401);
  });

  test("POST / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /diary", () => {
  test("creates entry with valid body and returns id 201", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeGreaterThan(0);
  });

  test("rejects missing entryDate with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, entryDate: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects moodLevel out of range (>9) with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, moodLevel: 10 }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects moodLevel out of range (<1) with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, moodLevel: 0 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /diary", () => {
  test("returns empty array when no entries", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  test("returns entries ordered by date desc", async () => {
    const { app, cookie } = await setup();
    await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, entryDate: "2026-05-10" }),
    });
    await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, entryDate: "2026-05-15" }),
    });
    const res = await app.request("/diary", { headers: { cookie } });
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].entryDate).toBe("2026-05-15");
    expect(body.data[1].entryDate).toBe("2026-05-10");
  });

  test("filters by from/to date range", async () => {
    const { app, cookie } = await setup();
    for (const date of ["2026-04-01", "2026-05-01", "2026-06-01"]) {
      await app.request("/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ ...validBody, entryDate: date }),
      });
    }
    const res = await app.request("/diary?from=2026-05-01&to=2026-05-31", { headers: { cookie } });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].entryDate).toBe("2026-05-01");
  });

  test("isolates entries across users (cross-user IDOR check)", async () => {
    const { ctx, app, cookie } = await setup();
    await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await app.request("/diary", { headers: { cookie: otherCookie } });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("PUT /diary/:id", () => {
  test("updates entry and returns ok", async () => {
    const { app, cookie } = await setup();
    const created = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    const { data } = await created.json();
    const res = await app.request(`/diary/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, description: "updated" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
  });

  test("returns 404 for non-existent id", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary/99999", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  test("returns 400 for non-numeric id (PR #82 regression)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary/abc", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(400);
  });

  test("cannot update another user's entry", async () => {
    const { ctx, app, cookie } = await setup();
    const created = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    const { data } = await created.json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await app.request(`/diary/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: otherCookie },
      body: JSON.stringify({ ...validBody, description: "hacker" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /diary/:id", () => {
  test("deletes entry and returns ok", async () => {
    const { app, cookie } = await setup();
    const created = await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    const { data } = await created.json();
    const res = await app.request(`/diary/${data.id}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);
    const list = await app.request("/diary", { headers: { cookie } });
    const listBody = await list.json();
    expect(listBody.data).toEqual([]);
  });

  test("returns 404 for non-existent id", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary/99999", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(404);
  });

  test("returns 400 for non-numeric id (PR #82 regression)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/diary/abc", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(400);
  });
});
