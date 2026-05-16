import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import authRoute from "./auth.ts";
import preferencesRoute from "./preferences.ts";
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
  app.route("/preferences", preferencesRoute);
  await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
  });
  const cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));
  return { ctx, app, cookie };
}

describe("preferences auth", () => {
  test("GET / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/preferences");
    expect(res.status).toBe(401);
  });

  test("PUT / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "x", chatRange: "all", lastRange: "all", graphSelection: {} }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /preferences", () => {
  test("returns defaults when no row exists", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/preferences", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.model).toBe("mistral-small-latest");
    expect(body.data.chatRange).toBe("all");
    expect(body.data.birthday).toBeNull();
  });
});

describe("PUT /preferences", () => {
  test("persists model + chatRange + birthday", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        model: "mistral-large-latest",
        chatRange: "30d",
        lastRange: "7d",
        graphSelection: { mood: true },
        birthday: "1990-06-15",
      }),
    });
    expect(res.status).toBe(200);
    const get = await (await app.request("/preferences", { headers: { cookie } })).json();
    expect(get.data.model).toBe("mistral-large-latest");
    expect(get.data.chatRange).toBe("30d");
    expect(get.data.birthday).toBe("1990-06-15");
    expect(get.data.graphSelection).toEqual({ mood: true });
  });

  test("rejects invalid birthday format with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        model: "x",
        chatRange: "all",
        lastRange: "all",
        graphSelection: {},
        birthday: "1990/06/15",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects nonexistent calendar date as birthday with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        model: "x",
        chatRange: "all",
        lastRange: "all",
        graphSelection: {},
        birthday: "1990-02-30",
      }),
    });
    expect(res.status).toBe(400);
  });

  test("upsert merges existing row (PUT twice keeps last values)", async () => {
    const { app, cookie } = await setup();
    await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        model: "model-a",
        chatRange: "all",
        lastRange: "all",
        graphSelection: {},
        birthday: "1990-01-01",
      }),
    });
    await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        model: "model-b",
        chatRange: "7d",
        lastRange: "all",
        graphSelection: {},
        birthday: "1991-02-02",
      }),
    });
    const get = await (await app.request("/preferences", { headers: { cookie } })).json();
    expect(get.data.model).toBe("model-b");
    expect(get.data.chatRange).toBe("7d");
    expect(get.data.birthday).toBe("1991-02-02");
  });

  test("isolates preferences across users (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    await app.request("/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        model: "user-a-model",
        chatRange: "all",
        lastRange: "all",
        graphSelection: {},
        birthday: null,
      }),
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await (
      await app.request("/preferences", { headers: { cookie: otherCookie } })
    ).json();
    expect(res.data.model).toBe("mistral-small-latest");
  });
});
