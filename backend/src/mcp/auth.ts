import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import type { DrizzleDB } from "../db/index.ts";
import { users } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { lookupTokenByPlaintext, touchTokenLastUsed } from "./tokens.ts";

export type McpAuthVars = {
  db: DrizzleDB;
  rawDb: SQLiteDB;
  userId: number;
  userEmail: string;
  mcpTokenId: number;
};

/**
 * Middleware that authenticates MCP requests via a Personal Access Token.
 * Expects an `Authorization: Bearer <token>` header.
 *
 * On success: sets `userId`, `userEmail`, and `mcpTokenId` on the Hono context,
 * and asynchronously updates the token's `last_used_at` timestamp.
 */
export const requirePat = createMiddleware<{ Variables: McpAuthVars }>(async (c, next) => {
  const header = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!header) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Missing Authorization header" } },
      401
    );
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  const captured = match?.[1];
  if (!captured) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Authorization header must use Bearer scheme" } },
      401
    );
  }
  const plaintext = captured.trim();
  if (!plaintext) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Empty bearer token" } }, 401);
  }

  const db = c.get("db");
  const lookup = lookupTokenByPlaintext(db, plaintext);
  if (!lookup) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401);
  }

  if (lookup.expiresAt) {
    const expiresMs = Date.parse(lookup.expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return c.json({ error: { code: "UNAUTHORIZED", message: "Token expired" } }, 401);
    }
  }

  const me = db
    .select({ id: users.id, email: users.email, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, lookup.userId))
    .limit(1)
    .get();
  if (!me || me.disabledAt) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "User account unavailable" } }, 401);
  }

  // Fire-and-forget; failure here must not block the request.
  try {
    touchTokenLastUsed(db, lookup.tokenId);
  } catch {
    // Intentionally ignored — observability metadata only.
  }

  c.set("userId", me.id);
  c.set("userEmail", me.email);
  c.set("mcpTokenId", lookup.tokenId);
  await next();
});
