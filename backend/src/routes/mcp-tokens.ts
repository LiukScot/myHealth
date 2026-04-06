import { Hono } from "hono";
import type { DrizzleDB } from "../db/index.ts";
import type { SQLiteDB } from "../db.ts";
import { parseJson } from "../helpers.ts";
import { mcpTokenCreateSchema } from "../schemas.ts";
import { requireAuth } from "../middleware/auth.ts";
import { createToken, listTokens, revokeToken } from "../mcp/tokens.ts";

type Env = {
  Variables: {
    db: DrizzleDB;
    rawDb: SQLiteDB;
    userId: number;
    userEmail: string;
    sessionSid: string;
  };
};

const mcpTokens = new Hono<Env>();

mcpTokens.use(requireAuth);

// GET /api/v1/mcp/tokens — list current user's tokens (without plaintext)
mcpTokens.get("/", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const tokens = listTokens(db, userId);
  return c.json({ data: { tokens } });
});

// POST /api/v1/mcp/tokens — create a new token. Returns plaintext exactly once.
mcpTokens.post("/", async (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const body = await parseJson(c, mcpTokenCreateSchema);

  const created = createToken(db, {
    userId,
    label: body.label ?? "",
    expiresAt: body.expiresAt ?? null,
  });

  return c.json(
    {
      data: {
        id: created.id,
        label: created.label,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        // Plaintext is intentionally returned only here. The frontend must
        // surface it to the user immediately and discard from memory.
        plaintext: created.plaintext,
      },
    },
    201
  );
});

// DELETE /api/v1/mcp/tokens/:id — revoke a token (only if owned by current user)
mcpTokens.delete("/:id", (c) => {
  const db = c.get("db");
  const userId = c.get("userId");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Invalid token id" } }, 400);
  }
  const ok = revokeToken(db, userId, id);
  if (!ok) {
    return c.json({ error: { code: "NOT_FOUND", message: "Token not found" } }, 404);
  }
  return c.json({ data: { ok: true } });
});

export default mcpTokens;
