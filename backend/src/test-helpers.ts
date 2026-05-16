import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { createDrizzle, users, sessions, type DrizzleDB } from "./db/index.ts";
import { runMigrations, type SQLiteDB } from "./db.ts";

export type TestContext = {
  db: DrizzleDB;
  rawDb: SQLiteDB;
};

export function createTestDb(): TestContext {
  const rawDb = new Database(":memory:");
  rawDb.query("PRAGMA journal_mode = MEMORY").run();
  rawDb.query("PRAGMA foreign_keys = ON").run();
  runMigrations(rawDb);
  return { rawDb, db: createDrizzle(rawDb) };
}

export type SeededUser = {
  id: number;
  email: string;
  password: string;
};

export async function seedUser(
  db: DrizzleDB,
  opts: { email?: string; password?: string; name?: string | null; disabledAt?: string | null } = {}
): Promise<SeededUser> {
  const email = opts.email ?? "test@example.com";
  const password = opts.password ?? "Password123!";
  const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
  const inserted = db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: opts.name ?? null,
      disabledAt: opts.disabledAt ?? null,
    })
    .returning({ id: users.id })
    .get();
  if (!inserted) {
    throw new Error("seedUser: failed to insert user");
  }
  return { id: inserted.id, email, password };
}

export async function seedSession(
  db: DrizzleDB,
  userId: number,
  email: string,
  opts: { ttlSeconds?: number } = {}
): Promise<string> {
  const sid = crypto.randomUUID().replaceAll("-", "");
  const ttl = opts.ttlSeconds ?? 60 * 60 * 24 * 30;
  db.insert(sessions)
    .values({
      sid,
      userId,
      email,
      expiresAt: sql`datetime('now', '+' || ${ttl} || ' seconds')`,
    })
    .run();
  return sid;
}

type ContextEnv = {
  Variables: {
    db: DrizzleDB;
    rawDb: SQLiteDB;
    userId?: number;
    userEmail?: string;
    sessionSid?: string;
  };
};

export function createTestApp(
  ctx: TestContext,
  mountPath: string,
  route: Hono<ContextEnv>
): Hono<ContextEnv> {
  const app = new Hono<ContextEnv>();
  app.use("*", async (c, next) => {
    c.set("db", ctx.db);
    c.set("rawDb", ctx.rawDb);
    await next();
  });
  app.route(mountPath, route);
  return app;
}

export function extractSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("extractSessionCookie: missing Set-Cookie header");
  }
  return setCookieHeader.split(";")[0];
}

export async function loginAndGetCookie(
  app: Hono<ContextEnv>,
  authMountPath: string,
  email: string,
  password: string
): Promise<string> {
  const res = await app.request(`${authMountPath}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`loginAndGetCookie: login failed ${res.status} ${body}`);
  }
  return extractSessionCookie(res.headers.get("set-cookie"));
}
