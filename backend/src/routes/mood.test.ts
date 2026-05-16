import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import authRoute from "./auth.ts";
import moodRoute from "./mood.ts";
import {
  createTestDb,
  extractSessionCookie,
  seedUser,
  type TestContext,
  type TestEnv,
} from "../test-helpers.ts";

async function setup(): Promise<{
  ctx: TestContext;
  app: Hono<TestEnv>;
  cookie: string;
}> {
  const ctx = createTestDb();
  const app = new Hono<TestEnv>();
  app.use("*", async (c, next) => {
    c.set("db", ctx.db);
    c.set("rawDb", ctx.rawDb);
    await next();
  });
  app.route("/auth", authRoute);
  app.route("/mood", moodRoute);
  await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
  });
  const cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));
  return { ctx, app, cookie };
}

describe("mood route auth", () => {
  test("GET /options requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/mood/options");
    expect(res.status).toBe(401);
  });

  test("POST /options/restore requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/mood/options/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "positive_moods", value: "happy" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /mood/options", () => {
  test("returns empty arrays for new user", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/mood/options", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      positive_moods: [],
      negative_moods: [],
      general_moods: [],
    });
  });
});

describe("mood options restore/remove", () => {
  test("restore then remove round-trips", async () => {
    const { app, cookie } = await setup();
    const restore = await app.request("/mood/options/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ field: "positive_moods", value: "joy" }),
    });
    expect(restore.status).toBe(200);
    let opts = await (await app.request("/mood/options", { headers: { cookie } })).json();
    expect(opts.data.positive_moods).toContain("joy");

    const remove = await app.request("/mood/options/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ field: "positive_moods", value: "joy" }),
    });
    expect(remove.status).toBe(200);
    opts = await (await app.request("/mood/options", { headers: { cookie } })).json();
    expect(opts.data.positive_moods).not.toContain("joy");
  });

  test("rejects unknown field 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/mood/options/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ field: "not_a_field", value: "x" }),
    });
    expect(res.status).toBe(400);
  });

  test("isolates mood options across users (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    await app.request("/mood/options/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ field: "positive_moods", value: "joy" }),
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await app.request("/mood/options", { headers: { cookie: otherCookie } });
    const body = await res.json();
    expect(body.data.positive_moods).toEqual([]);
  });
});
