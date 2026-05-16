import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import {
  getSession,
  createSession,
  deleteSession,
  cleanupExpiredSessions,
  requireAuth,
} from "./auth.ts";
import { createTestDb, extractSessionCookie, seedUser } from "../test-helpers.ts";
import { sessions } from "../db/index.ts";
import { env } from "../env.ts";
import { buildSessionCookie } from "../helpers.ts";

describe("getSession", () => {
  test("returns null when no cookie present", async () => {
    const ctx = createTestDb();
    const req = new Request("http://x/");
    const out = getSession(ctx.db, req);
    expect(out).toBeNull();
  });

  test("returns null when sid not in db", async () => {
    const ctx = createTestDb();
    const req = new Request("http://x/", {
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=nope` },
    });
    const out = getSession(ctx.db, req);
    expect(out).toBeNull();
  });

  test("returns session when sid valid + not expired", async () => {
    const ctx = createTestDb();
    const u = await seedUser(ctx.db);
    const sid = createSession(ctx.db, u.id, u.email);
    const req = new Request("http://x/", {
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${sid}` },
    });
    const out = getSession(ctx.db, req);
    expect(out?.userId).toBe(u.id);
    expect(out?.sid).toBe(sid);
  });

  test("returns null when sid exists but expired", async () => {
    const ctx = createTestDb();
    const u = await seedUser(ctx.db);
    const sid = "expired-sid-1234";
    ctx.db
      .insert(sessions)
      .values({ sid, userId: u.id, email: u.email, expiresAt: sql`datetime('now', '-1 days')` })
      .run();
    const req = new Request("http://x/", {
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${sid}` },
    });
    const out = getSession(ctx.db, req);
    expect(out).toBeNull();
  });
});

describe("createSession + deleteSession", () => {
  test("createSession persists row and returns sid", async () => {
    const ctx = createTestDb();
    const u = await seedUser(ctx.db);
    const sid = createSession(ctx.db, u.id, u.email);
    expect(sid.length).toBeGreaterThan(0);
    const req = new Request("http://x/", {
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${sid}` },
    });
    expect(getSession(ctx.db, req)?.userId).toBe(u.id);
  });

  test("deleteSession removes the row", async () => {
    const ctx = createTestDb();
    const u = await seedUser(ctx.db);
    const sid = createSession(ctx.db, u.id, u.email);
    deleteSession(ctx.db, sid);
    const req = new Request("http://x/", {
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${sid}` },
    });
    expect(getSession(ctx.db, req)).toBeNull();
  });
});

describe("cleanupExpiredSessions", () => {
  test("removes only expired rows, keeps valid ones", async () => {
    const ctx = createTestDb();
    const u = await seedUser(ctx.db);
    const validSid = createSession(ctx.db, u.id, u.email);
    const expiredSid = "expired-x-1";
    ctx.db
      .insert(sessions)
      .values({
        sid: expiredSid,
        userId: u.id,
        email: u.email,
        expiresAt: sql`datetime('now', '-1 days')`,
      })
      .run();

    cleanupExpiredSessions(ctx.rawDb);

    const reqValid = new Request("http://x/", {
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${validSid}` },
    });
    const reqExpired = new Request("http://x/", {
      headers: { cookie: `${env.SESSION_COOKIE_NAME}=${expiredSid}` },
    });
    expect(getSession(ctx.db, reqValid)).not.toBeNull();
    expect(getSession(ctx.db, reqExpired)).toBeNull();
  });
});

describe("requireAuth middleware", () => {
  test("returns 401 when no session present", async () => {
    const ctx = createTestDb();
    const app = new Hono<{
      Variables: {
        db: typeof ctx.db;
        rawDb: typeof ctx.rawDb;
        userId: number;
        userEmail: string;
        sessionSid: string;
      };
    }>();
    app.use("*", async (c, next) => {
      c.set("db", ctx.db);
      c.set("rawDb", ctx.rawDb);
      await next();
    });
    app.get("/protected", requireAuth, (c) => c.json({ data: { userId: c.get("userId") } }));
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
  });

  test("sets userId + userEmail + sessionSid when session valid", async () => {
    const ctx = createTestDb();
    const u = await seedUser(ctx.db, { email: "x@y.co", password: "Password123!" });
    const sid = createSession(ctx.db, u.id, u.email);
    const app = new Hono<{
      Variables: {
        db: typeof ctx.db;
        rawDb: typeof ctx.rawDb;
        userId: number;
        userEmail: string;
        sessionSid: string;
      };
    }>();
    app.use("*", async (c, next) => {
      c.set("db", ctx.db);
      c.set("rawDb", ctx.rawDb);
      await next();
    });
    app.get("/protected", requireAuth, (c) =>
      c.json({
        data: {
          userId: c.get("userId"),
          userEmail: c.get("userEmail"),
          sessionSid: c.get("sessionSid"),
        },
      })
    );
    const res = await app.request("/protected", {
      headers: { cookie: extractSessionCookie(buildSessionCookie(sid)) },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.userId).toBe(u.id);
    expect(body.data.userEmail).toBe("x@y.co");
    expect(body.data.sessionSid).toBe(sid);
  });

  test("returns 401 when user is disabled", async () => {
    const ctx = createTestDb();
    const u = await seedUser(ctx.db, {
      email: "x@y.co",
      password: "Password123!",
      disabledAt: new Date().toISOString(),
    });
    const sid = createSession(ctx.db, u.id, u.email);
    const app = new Hono<{
      Variables: {
        db: typeof ctx.db;
        rawDb: typeof ctx.rawDb;
        userId: number;
        userEmail: string;
        sessionSid: string;
      };
    }>();
    app.use("*", async (c, next) => {
      c.set("db", ctx.db);
      c.set("rawDb", ctx.rawDb);
      await next();
    });
    app.get("/protected", requireAuth, (c) => c.json({ data: { ok: true } }));
    const res = await app.request("/protected", {
      headers: { cookie: extractSessionCookie(buildSessionCookie(sid)) },
    });
    expect(res.status).toBe(401);
  });
});
