import { describe, expect, test, beforeEach } from "bun:test";
import authRoute from "./auth.ts";
import {
  createTestApp,
  createTestDb,
  seedUser,
  extractSessionCookie,
  type TestContext,
} from "../test-helpers.ts";

describe("POST /auth/login", () => {
  let ctx: TestContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    ctx = createTestDb();
    app = createTestApp(ctx, "/auth", authRoute);
    await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  });

  test("rejects unknown email with 401 INVALID_CREDENTIALS", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "Password123!" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("rejects wrong password with 401 INVALID_CREDENTIALS", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "WrongPassword!" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("rejects disabled account with 403 ACCOUNT_DISABLED", async () => {
    await seedUser(ctx.db, {
      email: "disabled@example.com",
      password: "Password123!",
      disabledAt: new Date().toISOString(),
    });
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "disabled@example.com", password: "Password123!" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("ACCOUNT_DISABLED");
  });

  test("succeeds with correct credentials and sets session cookie", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.email).toBe("user@example.com");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toBeTruthy();
    expect(cookie).toContain("HEALTH_SESSID=");
    expect(cookie).toContain("HttpOnly");
  });

  test("rejects password longer than 72 chars (PR #82 regression)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "x".repeat(73) }),
    });
    expect(res.status).toBe(400);
  });

  test("rejects email longer than 254 chars (PR #82 regression)", async () => {
    const longEmail = `${"x".repeat(250)}@e.co`;
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: longEmail, password: "Password123!" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  let ctx: TestContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    ctx = createTestDb();
    app = createTestApp(ctx, "/auth", authRoute);
    await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  });

  test("clears session cookie even when no session present", async () => {
    const res = await app.request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("HEALTH_SESSID=");
    expect(cookie).toContain("Max-Age=0");
  });

  test("deletes session row and clears cookie when logged in", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
    });
    const sessionCookie = extractSessionCookie(loginRes.headers.get("set-cookie"));

    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { cookie: sessionCookie },
    });
    expect(res.status).toBe(200);

    const sessionRes = await app.request("/auth/session", {
      headers: { cookie: sessionCookie },
    });
    const body = await sessionRes.json();
    expect(body.data.authenticated).toBe(false);
  });
});

describe("GET /auth/session", () => {
  let ctx: TestContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(async () => {
    ctx = createTestDb();
    app = createTestApp(ctx, "/auth", authRoute);
    await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  });

  test("returns authenticated=false without cookie", async () => {
    const res = await app.request("/auth/session");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.authenticated).toBe(false);
  });

  test("returns authenticated=true with valid session cookie", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
    });
    const cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));

    const res = await app.request("/auth/session", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.authenticated).toBe(true);
    expect(body.data.user.email).toBe("user@example.com");
  });
});

describe("POST /auth/change-password", () => {
  let ctx: TestContext;
  let app: ReturnType<typeof createTestApp>;
  let cookie: string;

  beforeEach(async () => {
    ctx = createTestDb();
    app = createTestApp(ctx, "/auth", authRoute);
    await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
    });
    cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));
  });

  test("requires authentication", async () => {
    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "Password123!", newPassword: "NewPassword456!" }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects wrong current password with 400", async () => {
    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ currentPassword: "WrongPassword!", newPassword: "NewPassword456!" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CURRENT_PASSWORD");
  });

  test("rejects currentPassword longer than 72 chars (argon2id cap regression)", async () => {
    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ currentPassword: "x".repeat(73), newPassword: "NewPassword456!" }),
    });
    expect(res.status).toBe(400);
  });

  test("succeeds and issues new session when current password matches", async () => {
    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ currentPassword: "Password123!", newPassword: "NewPassword456!" }),
    });
    expect(res.status).toBe(200);
    const newCookie = res.headers.get("set-cookie");
    expect(newCookie).toContain("HEALTH_SESSID=");

    const loginAgain = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "NewPassword456!" }),
    });
    expect(loginAgain.status).toBe(200);
  });
});
