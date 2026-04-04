import { createMiddleware } from "hono/factory";
import { eq, and, gt, sql } from "drizzle-orm";
import { env } from "../env.ts";
import { readCookie } from "../helpers.ts";
import type { DrizzleDB } from "../db/index.ts";
import { sessions, users } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";

export type SessionData = {
  sid: string;
  userId: number;
  email: string;
};

export function getSession(db: DrizzleDB, req: Request): SessionData | null {
  const sid = readCookie(req, env.SESSION_COOKIE_NAME);
  if (!sid) return null;
  const row = db
    .select({ sid: sessions.sid, userId: sessions.userId, email: sessions.email })
    .from(sessions)
    .where(and(eq(sessions.sid, sid), gt(sessions.expiresAt, sql`datetime('now')`)))
    .limit(1)
    .get();
  if (!row) return null;
  return { sid: row.sid, userId: row.userId, email: row.email };
}

export function createSession(db: DrizzleDB, userId: number, email: string): string {
  const sid = crypto.randomUUID().replaceAll("-", "");
  const ttlDays = Math.floor(env.SESSION_TTL_SECONDS / 86400);
  db.insert(sessions).values({
    sid,
    userId,
    email,
    expiresAt: sql`datetime('now', '+' || ${ttlDays} || ' days')`,
  }).run();
  return sid;
}

export function deleteSession(db: DrizzleDB, sid: string): void {
  db.delete(sessions).where(eq(sessions.sid, sid)).run();
}

/** Remove expired sessions — call on startup */
export function cleanupExpiredSessions(rawDb: SQLiteDB): void {
  rawDb.query(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
}

/**
 * Middleware that requires authentication.
 * Sets userId and userEmail on the context for use in route handlers.
 */
export const requireAuth = createMiddleware<{
  Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string };
}>(async (c, next) => {
  const db = c.get("db");
  const session = getSession(db, c.req.raw);
  if (!session) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  }

  const me = db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
    .get();
  if (!me) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  }

  c.set("userId", me.id);
  c.set("userEmail", me.email);
  c.set("sessionSid", session.sid);
  await next();
});
