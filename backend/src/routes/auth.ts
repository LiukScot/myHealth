import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { users } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson, buildSessionCookie, clearSessionCookie } from "../helpers.ts";
import { loginSchema, changePasswordSchema } from "../schemas.ts";
import { getSession, createSession, deleteSession, requireAuth } from "../middleware/auth.ts";

async function verifyPassword(password: string, storedHash: string): Promise<{ ok: boolean; rehash?: string }> {
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
    const ok = await Bun.password.verify(password, storedHash);
    if (!ok) return { ok: false };
    const rehash = await Bun.password.hash(password, { algorithm: "argon2id" });
    return { ok: true, rehash };
  }
  const ok = await Bun.password.verify(password, storedHash);
  return { ok };
}

type Env = { Variables: { db: DrizzleDB; rawDb: SQLiteDB; userId: number; userEmail: string; sessionSid: string } };

const auth = new Hono<Env>();

auth.post("/register", (c) => {
  return c.json({ error: { code: "SIGNUP_DISABLED", message: "Signup is disabled" } }, 403);
});

auth.post("/login", async (c) => {
  const db = c.get("db");
  const body = await parseJson(c, loginSchema);
  const user = db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      name: users.name,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1)
    .get();

  if (!user) {
    return c.json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } }, 401);
  }
  if (user.disabledAt) {
    return c.json({ error: { code: "ACCOUNT_DISABLED", message: "Account disabled" } }, 403);
  }

  const check = await verifyPassword(body.password, user.passwordHash);
  if (!check.ok) {
    return c.json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } }, 401);
  }

  if (check.rehash) {
    db.update(users)
      .set({ passwordHash: check.rehash, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.id, user.id))
      .run();
  }

  const sid = createSession(db, user.id, user.email);
  c.header("set-cookie", buildSessionCookie(sid));
  return c.json({ data: { email: user.email, name: user.name ?? null } });
});

auth.post("/logout", (c) => {
  const db = c.get("db");
  const session = getSession(db, c.req.raw);
  if (session) {
    deleteSession(db, session.sid);
  }
  c.header("set-cookie", clearSessionCookie());
  return c.json({ data: { ok: true } });
});

auth.get("/session", (c) => {
  const db = c.get("db");
  const session = getSession(db, c.req.raw);
  if (!session) {
    return c.json({ data: { authenticated: false } });
  }
  const user = db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
    .get();
  if (!user) {
    return c.json({ data: { authenticated: false } });
  }
  return c.json({ data: { authenticated: true, user: { id: user.id, email: user.email, name: user.name ?? null } } });
});

auth.post("/change-password", requireAuth, async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const sessionSid = c.get("sessionSid");
  const body = await parseJson(c, changePasswordSchema);

  const row = db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .get();
  if (!row) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  }
  const current = await verifyPassword(body.currentPassword, row.passwordHash);
  if (!current.ok) {
    return c.json({ error: { code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect" } }, 400);
  }
  const newHash = await Bun.password.hash(body.newPassword, { algorithm: "argon2id" });
  db.update(users)
    .set({ passwordHash: newHash, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(users.id, userId))
    .run();

  deleteSession(db, sessionSid);
  const sid = createSession(db, userId, userEmail);
  c.header("set-cookie", buildSessionCookie(sid));
  return c.json({ data: { ok: true } });
});

export default auth;
