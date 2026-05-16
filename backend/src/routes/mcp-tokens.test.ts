import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import authRoute from "./auth.ts";
import mcpTokensRoute from "./mcp-tokens.ts";
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
  app.route("/mcp/tokens", mcpTokensRoute);
  await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
  });
  const cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));
  return { ctx, app, cookie };
}

describe("mcp-tokens auth", () => {
  test("GET / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/mcp/tokens");
    expect(res.status).toBe(401);
  });

  test("POST / requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "ci" }),
    });
    expect(res.status).toBe(401);
  });

  test("DELETE /:id requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/mcp/tokens/1", { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

describe("POST /mcp/tokens", () => {
  test("creates a token, returns plaintext exactly once", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ label: "ci", expiresAt: null }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeGreaterThan(0);
    expect(body.data.label).toBe("ci");
    expect(typeof body.data.plaintext).toBe("string");
    expect(body.data.plaintext).toMatch(/^health_pat_/);
  });

  test("accepts default empty label", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
  });

  test("rejects label longer than 100 chars with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ label: "x".repeat(101) }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /mcp/tokens", () => {
  test("lists tokens without plaintext", async () => {
    const { app, cookie } = await setup();
    await app.request("/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ label: "one" }),
    });
    await app.request("/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ label: "two" }),
    });
    const res = await app.request("/mcp/tokens", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.tokens).toHaveLength(2);
    for (const t of body.data.tokens) {
      expect(t).not.toHaveProperty("plaintext");
      expect(t).not.toHaveProperty("tokenHash");
    }
  });

  test("returns empty array when no tokens", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/mcp/tokens", { headers: { cookie } });
    const body = await res.json();
    expect(body.data.tokens).toEqual([]);
  });

  test("isolates tokens across users (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    await app.request("/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ label: "mine" }),
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await (
      await app.request("/mcp/tokens", { headers: { cookie: otherCookie } })
    ).json();
    expect(res.data.tokens).toEqual([]);
  });
});

describe("DELETE /mcp/tokens/:id", () => {
  test("revokes a token owned by user", async () => {
    const { app, cookie } = await setup();
    const created = await (
      await app.request("/mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ label: "drop-me" }),
      })
    ).json();
    const res = await app.request(`/mcp/tokens/${created.data.id}`, { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);
    const list = await (await app.request("/mcp/tokens", { headers: { cookie } })).json();
    expect(list.data.tokens).toEqual([]);
  });

  test("returns 400 for invalid id (non-numeric)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/mcp/tokens/abc", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(400);
  });

  test("cannot revoke another user's token (IDOR)", async () => {
    const { ctx, app, cookie } = await setup();
    const created = await (
      await app.request("/mcp/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ label: "mine" }),
      })
    ).json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await app.request(`/mcp/tokens/${created.data.id}`, {
      method: "DELETE",
      headers: { cookie: otherCookie },
    });
    expect(res.status).toBe(404);
  });
});
