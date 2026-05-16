import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import authRoute from "./auth.ts";
import cbtRoute from "./cbt.ts";
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
  app.route("/cbt", cbtRoute);
  await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
  });
  const cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));
  return { ctx, app, cookie };
}

const validBody = {
  entryDate: "2026-05-16",
  entryTime: "11:00",
  situation: "Got stuck",
  thoughts: "I cannot do this",
  helpfulReasoning: "I can break it down",
  mainUnhelpfulThought: "I am useless",
  effectOfBelieving: "Paralysed",
  evidenceForAgainst: "Done it before",
  alternativeExplanation: "First time is hard",
  worstBestScenario: "Worst: fail. Best: learn",
  friendAdvice: "Be kind to yourself",
  productiveResponse: "Take a break, retry",
};

describe("cbt route auth", () => {
  test("GET / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/cbt");
    expect(res.status).toBe(401);
  });

  test("POST / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/cbt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /cbt", () => {
  test("creates entry with valid body 201", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/cbt", {
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
    const res = await app.request("/cbt", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, entryDate: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /cbt", () => {
  test("returns empty array when no entries", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/cbt", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  test("returns entries ordered by date desc", async () => {
    const { app, cookie } = await setup();
    await app.request("/cbt", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, entryDate: "2026-05-10" }),
    });
    await app.request("/cbt", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, entryDate: "2026-05-15" }),
    });
    const res = await app.request("/cbt", { headers: { cookie } });
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].entryDate).toBe("2026-05-15");
  });

  test("isolates entries across users (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    await app.request("/cbt", {
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
    const res = await app.request("/cbt", { headers: { cookie: otherCookie } });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("PUT /cbt/:id", () => {
  test("updates entry and returns ok", async () => {
    const { app, cookie } = await setup();
    const created = await app.request("/cbt", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    const { data } = await created.json();
    const res = await app.request(`/cbt/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBody, situation: "updated" }),
    });
    expect(res.status).toBe(200);
  });

  test("returns 404 for non-existent id", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/cbt/99999", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  test("returns 400 for non-numeric id (PR #82 regression)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/cbt/abc", {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(400);
  });

  test("cannot update another user's entry (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    const created = await app.request("/cbt", {
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
    const res = await app.request(`/cbt/${data.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: otherCookie },
      body: JSON.stringify({ ...validBody, situation: "hacker" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /cbt/:id", () => {
  test("deletes entry and returns ok", async () => {
    const { app, cookie } = await setup();
    const created = await app.request("/cbt", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(validBody),
    });
    const { data } = await created.json();
    const res = await app.request(`/cbt/${data.id}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);
  });

  test("returns 400 for non-numeric id (PR #82 regression)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/cbt/abc", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(400);
  });
});
